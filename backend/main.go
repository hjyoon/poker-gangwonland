package main

import (
	"bufio"
	"crypto/rand"
	"crypto/sha1"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	defaultPort       = "3000"
	defaultStaticDir  = "/app/public"
	maxHumanSlots     = 8
	minHumanSlots     = 1
	maxFrameBytes     = 128 * 1024
	webSocketGUID     = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
	defaultPlayerName = "참가자"
)

type server struct {
	staticDir string
	hub       *roomHub
}

type roomHub struct {
	mu    sync.Mutex
	rooms map[string]*room
}

type room struct {
	ID                  string                 `json:"id"`
	HumanSlots          int                    `json:"humanSlots"`
	HostPlayerID        string                 `json:"hostPlayerId"`
	Seats               []seat                 `json:"seats"`
	WaitingParticipants []waitingParticipant   `json:"waitingParticipants"`
	CreatedAt           int64                  `json:"createdAt"`
	Settings            map[string]any         `json:"settings"`
	ShowComputerStyles  bool                   `json:"showComputerStyles"`
	ShowCumulativeWins  bool                   `json:"showCumulativeWins"`
	RequiredPlayerIDs   []string               `json:"nextHandRequiredPlayerIds"`
	ReadyPlayerIDs      []string               `json:"nextHandReadyPlayerIds"`
	NextDealerPlayerID  *string                `json:"nextHandDealerPlayerId"`
	CanReserveStandUp   bool                   `json:"canReserveStandUpFromGame"`
	CardPeekPlayerIDs   []string               `json:"cardPeekPlayerIds"`
	Timer               any                    `json:"timer"`
	GameState           any                    `json:"gameState"`
	clients             map[*wsClient]struct{} `json:"-"`
}

type seat struct {
	ID                string `json:"id"`
	Label             string `json:"label"`
	PlayerID          string `json:"playerId"`
	Name              string `json:"name"`
	Connected         bool   `json:"connected"`
	Away              bool   `json:"away"`
	PendingAway       bool   `json:"pendingAway"`
	PendingReturn     bool   `json:"pendingReturn"`
	PendingStandUp    bool   `json:"pendingStandUp"`
	PendingJoin       bool   `json:"pendingJoin"`
	PendingEndless    bool   `json:"pendingEndlessJoin"`
	MissedSmallBlind  bool   `json:"missedSmallBlind"`
	MissedBigBlind    bool   `json:"missedBigBlind"`
	MissedBlindAmount int    `json:"missedBlindAmount"`
}

type waitingParticipant struct {
	PlayerID           string `json:"playerId"`
	Name               string `json:"name"`
	Connected          bool   `json:"connected"`
	PendingEndlessJoin bool   `json:"pendingEndlessJoin"`
	CreatedAt          int64  `json:"createdAt"`
}

type wsClient struct {
	conn     net.Conn
	writerMu sync.Mutex
	hub      *roomHub
	roomID   string
	playerID string
}

type clientMessage struct {
	Type        string         `json:"type"`
	RoomID      string         `json:"roomId"`
	PlayerID    string         `json:"playerId"`
	PlayerName  string         `json:"playerName"`
	HumanSlots  int            `json:"humanSlots"`
	Settings    map[string]any `json:"settings"`
	AutoNext    any            `json:"autoNextHand"`
	EndlessMode any            `json:"endlessMode"`
}

func main() {
	port := env("PORT", defaultPort)
	host := env("HOSTNAME", "0.0.0.0")
	staticDir := env("STATIC_DIR", defaultStaticDir)

	app := &server{
		staticDir: staticDir,
		hub: &roomHub{
			rooms: map[string]*room{},
		},
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", app.health)
	mux.HandleFunc("/ws", app.websocket)
	mux.HandleFunc("/", app.static)

	addr := net.JoinHostPort(host, port)
	log.Printf("ready on http://%s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatal(err)
	}
}

func env(key string, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	return value
}

func (s *server) health(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	_, _ = w.Write([]byte("ok\n"))
}

func (s *server) static(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	cleanPath := filepath.Clean("/" + r.URL.Path)
	target := filepath.Join(s.staticDir, strings.TrimPrefix(cleanPath, "/"))
	if info, err := os.Stat(target); err == nil && !info.IsDir() {
		http.ServeFile(w, r, target)
		return
	}
	if info, err := os.Stat(target); err == nil && info.IsDir() {
		indexPath := filepath.Join(target, "index.html")
		if _, err := os.Stat(indexPath); err == nil {
			http.ServeFile(w, r, indexPath)
			return
		}
	}

	indexPath := filepath.Join(s.staticDir, "index.html")
	if _, err := os.Stat(indexPath); err != nil {
		http.NotFound(w, r)
		return
	}
	http.ServeFile(w, r, indexPath)
}

func (s *server) websocket(w http.ResponseWriter, r *http.Request) {
	if !strings.EqualFold(r.Header.Get("Upgrade"), "websocket") {
		http.Error(w, "websocket upgrade required", http.StatusUpgradeRequired)
		return
	}

	key := strings.TrimSpace(r.Header.Get("Sec-WebSocket-Key"))
	if key == "" {
		http.Error(w, "missing websocket key", http.StatusBadRequest)
		return
	}

	hijacker, ok := w.(http.Hijacker)
	if !ok {
		http.Error(w, "websocket unsupported", http.StatusInternalServerError)
		return
	}

	conn, rw, err := hijacker.Hijack()
	if err != nil {
		return
	}

	accept := websocketAccept(key)
	_, err = fmt.Fprintf(
		rw,
		"HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: %s\r\n\r\n",
		accept,
	)
	if err != nil {
		_ = conn.Close()
		return
	}
	if err := rw.Flush(); err != nil {
		_ = conn.Close()
		return
	}

	client := &wsClient{conn: conn, hub: s.hub}
	client.send(map[string]any{"type": "connected"})
	client.readLoop(rw.Reader)
}

func websocketAccept(key string) string {
	sum := sha1.Sum([]byte(key + webSocketGUID))
	return base64.StdEncoding.EncodeToString(sum[:])
}

func (c *wsClient) readLoop(reader *bufio.Reader) {
	defer c.close()

	for {
		opcode, payload, err := readFrame(reader)
		if err != nil {
			return
		}
		switch opcode {
		case 0x8:
			return
		case 0x9:
			_ = c.writeFrame(0xA, payload)
		case 0x1:
			c.handleText(payload)
		}
	}
}

func (c *wsClient) close() {
	c.hub.disconnect(c)
	_ = c.conn.Close()
}

func (c *wsClient) send(payload any) {
	body, err := json.Marshal(payload)
	if err != nil {
		return
	}
	_ = c.writeFrame(0x1, body)
}

func (c *wsClient) sendError(message string) {
	c.send(map[string]any{"type": "error", "message": message})
}

func (c *wsClient) writeFrame(opcode byte, payload []byte) error {
	c.writerMu.Lock()
	defer c.writerMu.Unlock()

	header := []byte{0x80 | opcode}
	switch {
	case len(payload) < 126:
		header = append(header, byte(len(payload)))
	case len(payload) <= 65535:
		header = append(header, 126, byte(len(payload)>>8), byte(len(payload)))
	default:
		return errors.New("websocket frame too large")
	}
	if _, err := c.conn.Write(header); err != nil {
		return err
	}
	_, err := c.conn.Write(payload)
	return err
}

func readFrame(reader *bufio.Reader) (byte, []byte, error) {
	header := make([]byte, 2)
	if _, err := io.ReadFull(reader, header); err != nil {
		return 0, nil, err
	}

	opcode := header[0] & 0x0f
	masked := header[1]&0x80 != 0
	length := int64(header[1] & 0x7f)
	switch length {
	case 126:
		extended := make([]byte, 2)
		if _, err := io.ReadFull(reader, extended); err != nil {
			return 0, nil, err
		}
		length = int64(extended[0])<<8 | int64(extended[1])
	case 127:
		return 0, nil, errors.New("large websocket frames are unsupported")
	}
	if length > maxFrameBytes {
		return 0, nil, errors.New("websocket frame too large")
	}

	var mask []byte
	if masked {
		mask = make([]byte, 4)
		if _, err := io.ReadFull(reader, mask); err != nil {
			return 0, nil, err
		}
	}

	payload := make([]byte, length)
	if _, err := io.ReadFull(reader, payload); err != nil {
		return 0, nil, err
	}
	if masked {
		for index := range payload {
			payload[index] ^= mask[index%4]
		}
	}

	return opcode, payload, nil
}

func (c *wsClient) handleText(payload []byte) {
	var message clientMessage
	if err := json.Unmarshal(payload, &message); err != nil {
		c.sendError("메시지를 처리할 수 없습니다.")
		return
	}

	switch message.Type {
	case "createRoom":
		c.hub.createRoom(c, message)
	case "joinRoom", "rejoinRoom":
		c.hub.joinRoom(c, message)
	case "updatePlayerName":
		c.hub.updatePlayerName(c, message.PlayerName)
	case "updateRoomSettings":
		c.hub.updateRoomSettings(c, message.Settings)
	case "leaveRoom":
		c.hub.leaveRoom(c, true)
		c.send(map[string]any{"type": "leftRoom"})
	case "startGame", "gameAction", "requestNextHand", "setSeatAway", "standUpFromGame", "reserveEndlessSeat", "joinGameSeat", "cardPeekState", "updateGameOptions":
		c.sendError("현재 Docker Go 런타임은 정적 프론트엔드와 룸 대기실만 제공합니다. 멀티플레이 게임 엔진은 Go로 추가 포팅이 필요합니다.")
	default:
		c.sendError("알 수 없는 메시지입니다.")
	}
}

func (h *roomHub) createRoom(client *wsClient, message clientMessage) {
	h.leaveRoom(client, true)

	roomID := h.newRoomID()
	playerID := newID()
	humanSlots := clamp(message.HumanSlots, minHumanSlots, maxHumanSlots, minHumanSlots)
	now := time.Now().UnixMilli()
	settings := normalizeSettings(message.Settings)
	room := &room{
		ID:                  roomID,
		HumanSlots:          humanSlots,
		HostPlayerID:        playerID,
		Seats:               make([]seat, humanSlots),
		WaitingParticipants: []waitingParticipant{},
		CreatedAt:           now,
		Settings:            settings,
		ShowComputerStyles:  boolSetting(settings, "showComputerStyles", true),
		ShowCumulativeWins:  boolSetting(settings, "showCumulativeWins", true),
		RequiredPlayerIDs:   []string{},
		ReadyPlayerIDs:      []string{},
		CardPeekPlayerIDs:   []string{},
		Timer:               nil,
		GameState:           nil,
		clients:             map[*wsClient]struct{}{client: {}},
	}
	for index := range room.Seats {
		room.Seats[index] = emptySeat(index)
	}
	room.Seats[0].PlayerID = playerID
	room.Seats[0].Name = sanitizeName(message.PlayerName, "방장")
	room.Seats[0].Connected = true

	h.mu.Lock()
	h.rooms[room.ID] = room
	client.roomID = room.ID
	client.playerID = playerID
	h.mu.Unlock()

	client.send(map[string]any{"type": "joinedRoom", "roomId": room.ID, "playerId": playerID})
	h.broadcast(room)
}

func (h *roomHub) joinRoom(client *wsClient, message clientMessage) {
	roomID := strings.ToUpper(strings.TrimSpace(message.RoomID))
	h.mu.Lock()
	room := h.rooms[roomID]
	if room == nil {
		h.mu.Unlock()
		client.sendError("룸을 찾을 수 없습니다.")
		return
	}

	requestedPlayerID := strings.TrimSpace(message.PlayerID)
	targetIndex := -1
	if requestedPlayerID != "" {
		for index := range room.Seats {
			if room.Seats[index].PlayerID == requestedPlayerID {
				targetIndex = index
				break
			}
		}
	}
	if targetIndex >= 0 && room.Seats[targetIndex].Connected {
		h.mu.Unlock()
		client.sendError("이미 연결된 참가자입니다.")
		return
	}
	if targetIndex < 0 {
		for index := range room.Seats {
			if room.Seats[index].PlayerID == "" {
				targetIndex = index
				break
			}
		}
	}
	if targetIndex < 0 {
		h.mu.Unlock()
		client.sendError("빈 자리가 없습니다.")
		return
	}

	h.detachLocked(client, true)
	playerID := room.Seats[targetIndex].PlayerID
	if playerID == "" {
		playerID = newID()
	}
	room.Seats[targetIndex].PlayerID = playerID
	room.Seats[targetIndex].Name = sanitizeName(message.PlayerName, defaultPlayerName)
	room.Seats[targetIndex].Connected = true
	room.clients[client] = struct{}{}
	client.roomID = room.ID
	client.playerID = playerID
	h.mu.Unlock()

	client.send(map[string]any{"type": "joinedRoom", "roomId": room.ID, "playerId": playerID})
	h.broadcast(room)
}

func (h *roomHub) updatePlayerName(client *wsClient, playerName string) {
	h.mu.Lock()
	room := h.rooms[client.roomID]
	if room == nil || client.playerID == "" {
		h.mu.Unlock()
		client.sendError("먼저 멀티플레이 룸에 참가해야 합니다.")
		return
	}
	nextName := sanitizeName(playerName, "플레이어")
	for index := range room.Seats {
		if room.Seats[index].PlayerID == client.playerID {
			room.Seats[index].Name = nextName
			break
		}
	}
	h.mu.Unlock()
	h.broadcast(room)
}

func (h *roomHub) updateRoomSettings(client *wsClient, settings map[string]any) {
	h.mu.Lock()
	room := h.rooms[client.roomID]
	if room == nil || room.HostPlayerID != client.playerID {
		h.mu.Unlock()
		client.sendError("방장만 게임 설정을 변경할 수 있습니다.")
		return
	}
	room.Settings = normalizeSettings(settings)
	room.ShowComputerStyles = boolSetting(room.Settings, "showComputerStyles", true)
	room.ShowCumulativeWins = boolSetting(room.Settings, "showCumulativeWins", true)
	h.syncSeatsToSettings(room)
	h.mu.Unlock()
	h.broadcast(room)
}

func (h *roomHub) disconnect(client *wsClient) {
	h.leaveRoom(client, false)
}

func (h *roomHub) leaveRoom(client *wsClient, clearSeat bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.detachLocked(client, clearSeat)
}

func (h *roomHub) detachLocked(client *wsClient, clearSeat bool) {
	room := h.rooms[client.roomID]
	if room == nil {
		client.roomID = ""
		client.playerID = ""
		return
	}
	delete(room.clients, client)
	for index := range room.Seats {
		if room.Seats[index].PlayerID != client.playerID {
			continue
		}
		if clearSeat {
			room.Seats[index] = emptySeat(index)
		} else {
			room.Seats[index].Connected = false
		}
		break
	}
	if len(room.clients) == 0 {
		delete(h.rooms, room.ID)
	}
	client.roomID = ""
	client.playerID = ""
}

func (h *roomHub) broadcast(room *room) {
	h.mu.Lock()
	clients := make([]*wsClient, 0, len(room.clients))
	for client := range room.clients {
		clients = append(clients, client)
	}
	h.mu.Unlock()

	for _, client := range clients {
		client.send(map[string]any{"type": "roomState", "room": room})
	}
}

func (h *roomHub) newRoomID() string {
	h.mu.Lock()
	defer h.mu.Unlock()
	for {
		id := strings.ToUpper(randomHex(3))
		if _, exists := h.rooms[id]; !exists {
			return id
		}
	}
}

func (h *roomHub) syncSeatsToSettings(room *room) {
	humanPlayers, _ := room.Settings["humanPlayers"].([]any)
	nextSlots := len(humanPlayers)
	if nextSlots < minHumanSlots {
		nextSlots = room.HumanSlots
	}
	nextSlots = clamp(nextSlots, minHumanSlots, maxHumanSlots, room.HumanSlots)

	if nextSlots > len(room.Seats) {
		for index := len(room.Seats); index < nextSlots; index++ {
			room.Seats = append(room.Seats, emptySeat(index))
		}
	}
	if nextSlots < len(room.Seats) {
		room.Seats = room.Seats[:nextSlots]
	}
	for index := range room.Seats {
		room.Seats[index].ID = fmt.Sprintf("human-slot-%d", index+1)
		room.Seats[index].Label = fmt.Sprintf("빈 자리 %d", index+1)
	}
	room.HumanSlots = nextSlots
}

func emptySeat(index int) seat {
	return seat{
		ID:                fmt.Sprintf("human-slot-%d", index+1),
		Label:             fmt.Sprintf("빈 자리 %d", index+1),
		PlayerID:          "",
		Name:              "",
		Connected:         false,
		Away:              false,
		PendingAway:       false,
		PendingReturn:     false,
		PendingStandUp:    false,
		PendingJoin:       false,
		PendingEndless:    false,
		MissedSmallBlind:  false,
		MissedBigBlind:    false,
		MissedBlindAmount: 0,
	}
}

func normalizeSettings(settings map[string]any) map[string]any {
	if settings == nil {
		settings = map[string]any{}
	}
	if _, ok := settings["showComputerStyles"]; !ok {
		settings["showComputerStyles"] = true
	}
	if _, ok := settings["showCumulativeWins"]; !ok {
		settings["showCumulativeWins"] = true
	}
	return settings
}

func boolSetting(settings map[string]any, key string, fallback bool) bool {
	value, ok := settings[key]
	if !ok {
		return fallback
	}
	boolValue, ok := value.(bool)
	if !ok {
		return fallback
	}
	return boolValue
}

func sanitizeName(value string, fallback string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		value = fallback
	}
	runes := []rune(value)
	if len(runes) > 20 {
		return string(runes[:20])
	}
	return value
}

func clamp(value int, min int, max int, fallback int) int {
	if value == 0 {
		value = fallback
	}
	if value < min {
		return min
	}
	if value > max {
		return max
	}
	return value
}

func newID() string {
	return randomHex(16)
}

func randomHex(byteCount int) string {
	buffer := make([]byte, byteCount)
	if _, err := rand.Read(buffer); err != nil {
		return strconv.FormatInt(time.Now().UnixNano(), 16)
	}
	return hex.EncodeToString(buffer)
}
