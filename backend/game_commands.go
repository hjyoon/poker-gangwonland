package main

import (
	"strings"
	"time"
)

func (h *roomHub) setSeatAway(client *wsClient, message clientMessage) {
	h.mu.Lock()
	room := h.rooms[client.roomID]
	if room == nil || client.playerID == "" {
		h.mu.Unlock()
		client.sendError("먼저 멀티플레이 룸에 참가해야 합니다.")
		return
	}
	if room.Tournament != nil {
		h.mu.Unlock()
		client.sendError("토너먼트 참가자는 자리 비움을 설정할 수 없습니다. 연결이 끊기면 자동 폴드됩니다.")
		return
	}
	seat := room.seatByPlayerID(client.playerID)
	if seat == nil {
		h.mu.Unlock()
		client.sendError("참가자 자리를 찾을 수 없습니다.")
		return
	}
	handInProgress := room.Game != nil && room.Game.State != nil && !boolValue(room.Game.State["finished"]) && !boolValue(room.Game.State["gameOver"])
	if handInProgress {
		if seat.Away == message.Away {
			seat.PendingAway = false
			seat.PendingReturn = false
		} else {
			seat.PendingAway = message.Away
			seat.PendingReturn = !message.Away
		}
	} else {
		seat.Away = message.Away
		seat.PendingAway = false
		seat.PendingReturn = false
	}
	seat.PendingStandUp = false
	seat.PendingJoin = false
	seat.PendingEndless = false
	if room.Game != nil {
		delete(room.Game.NextHandReadyPlayerIDs, client.playerID)
		delete(room.Game.CardPeekPlayerIDs, client.playerID)
	}
	roomID := room.ID
	h.mu.Unlock()
	h.scheduleRoomAutomation(roomID)
}

func (h *roomHub) standUpFromGame(client *wsClient, message clientMessage) {
	h.mu.Lock()
	room := h.rooms[client.roomID]
	if room == nil || room.Game == nil || client.playerID == "" {
		h.mu.Unlock()
		client.sendError("진행 중인 멀티플레이 게임에 참가해야 합니다.")
		return
	}
	if room.Tournament != nil {
		h.mu.Unlock()
		client.sendError("진행 중인 토너먼트에서는 게임 좌석에서 빠질 수 없습니다.")
		return
	}
	seat := room.seatByPlayerID(client.playerID)
	if seat == nil {
		h.mu.Unlock()
		client.sendError("현재 게임 좌석에 앉아 있지 않습니다.")
		return
	}
	if message.Cancel {
		if !seat.PendingStandUp {
			h.mu.Unlock()
			client.sendError("취소할 게임 퇴장 예약이 없습니다.")
			return
		}
		seat.PendingStandUp = false
	} else if boolValue(room.Game.State["gameOver"]) {
		h.mu.Unlock()
		client.sendError("종료된 게임에서는 게임에서 빠지기를 예약할 수 없습니다.")
		return
	} else {
		seat.PendingStandUp = true
		seat.PendingAway = false
		seat.PendingReturn = false
		seat.PendingJoin = false
		seat.PendingEndless = false
	}
	delete(room.Game.CardPeekPlayerIDs, client.playerID)
	roomID := room.ID
	h.mu.Unlock()
	h.scheduleRoomAutomation(roomID)
}

func (h *roomHub) reserveEndlessSeat(client *wsClient, message clientMessage) {
	h.mu.Lock()
	room := h.rooms[client.roomID]
	if room == nil || room.Game == nil || client.playerID == "" {
		h.mu.Unlock()
		client.sendError("진행 중인 멀티플레이 룸에 참가해야 합니다.")
		return
	}
	if room.Tournament != nil {
		h.mu.Unlock()
		client.sendError("토너먼트에서는 엔들리스 자리 예약을 사용할 수 없습니다.")
		return
	}
	if !room.Game.EndlessMode || gameStateOver(room) {
		h.mu.Unlock()
		client.sendError("엔들리스 모드에서만 다음 자리 예약을 할 수 있습니다.")
		return
	}
	seat := room.seatByPlayerID(client.playerID)
	if message.Cancel {
		if seat != nil {
			seat.PendingEndless = false
		}
		room.WaitingParticipants = filterWaitingParticipants(room.WaitingParticipants, client.playerID)
		h.mu.Unlock()
		h.broadcast(room)
		return
	}
	name := sanitizeName(message.PlayerName, "플레이어")
	if seat != nil {
		seat.Name = name
		seat.Connected = true
		seat.Away = false
		seat.PendingEndless = true
		seat.PendingJoin = false
		seat.PendingStandUp = false
	} else {
		room.WaitingParticipants = append(filterWaitingParticipants(room.WaitingParticipants, client.playerID), waitingParticipant{
			PlayerID:           client.playerID,
			Name:               name,
			Connected:          true,
			PendingEndlessJoin: true,
			CreatedAt:          time.Now().UnixMilli(),
		})
	}
	roomID := room.ID
	h.mu.Unlock()
	h.scheduleRoomAutomation(roomID)
}

func filterWaitingParticipants(values []waitingParticipant, playerID string) []waitingParticipant {
	result := []waitingParticipant{}
	for _, value := range values {
		if value.PlayerID != playerID {
			result = append(result, value)
		}
	}
	return result
}

func (h *roomHub) joinGameSeat(client *wsClient, message clientMessage) {
	h.mu.Lock()
	room := h.rooms[client.roomID]
	if room == nil || room.Game == nil || client.playerID == "" {
		h.mu.Unlock()
		client.sendError("먼저 멀티플레이 룸에 참가해야 합니다.")
		return
	}
	if room.Tournament != nil {
		h.mu.Unlock()
		client.sendError("토너먼트 시작 후에는 빈 좌석에 새로 참가할 수 없습니다.")
		return
	}
	tableSeatIndex := message.TableSeatIndex
	if activePlayer := playerAt(room.Game.State, statePlayerIndexByID(room.Game.State, client.playerID)); playerID(activePlayer) == client.playerID && !boolValue(activePlayer["eliminated"]) {
		h.mu.Unlock()
		client.sendError("이미 현재 게임에 참여 중입니다.")
		return
	}
	if tableSeatIndex < 0 || tableSeatIndex >= len(room.Game.TableSeatOrder) {
		h.mu.Unlock()
		client.sendError("참여할 빈 자리를 찾을 수 없습니다.")
		return
	}
	entry := room.Game.TableSeatOrder[tableSeatIndex]
	setupID := stringValue(entry["setupPlayerId"])
	if !strings.HasPrefix(setupID, "human-slot-") {
		h.mu.Unlock()
		client.sendError("참여할 수 있는 인간 플레이어 빈 자리가 아닙니다.")
		return
	}
	slotIndex := intValue(strings.TrimPrefix(setupID, "human-slot-")) - 1
	if slotIndex < 0 || slotIndex >= len(room.Seats) {
		h.mu.Unlock()
		client.sendError("참여할 수 있는 인간 플레이어 빈 자리가 아닙니다.")
		return
	}
	target := &room.Seats[slotIndex]
	if target.PlayerID == client.playerID && target.PendingJoin {
		h.mu.Unlock()
		client.sendError("이미 다음 핸드 참가가 예약되어 있습니다.")
		return
	}
	if target.PlayerID != "" && target.PlayerID != client.playerID {
		h.mu.Unlock()
		client.sendError("이미 다른 참가자가 예약한 자리입니다.")
		return
	}
	if current := room.seatByPlayerID(client.playerID); current != nil && current != target {
		for index := range room.Seats {
			if room.Seats[index].PlayerID == client.playerID {
				room.Seats[index] = emptySeat(index)
				break
			}
		}
	}
	name := sanitizeName(message.PlayerName, "플레이어")
	target.PlayerID = client.playerID
	target.Name = name
	target.Connected = true
	target.Away = false
	target.PendingJoin = true
	target.PendingEndless = false
	target.PendingStandUp = false
	entry["playerId"] = client.playerID
	entry["label"] = name
	room.WaitingParticipants = filterWaitingParticipants(room.WaitingParticipants, client.playerID)
	h.upsertHumanPlayerConfigLocked(room, client.playerID, name, slotIndex)
	roomID := room.ID
	h.mu.Unlock()
	h.scheduleRoomAutomation(roomID)
}

func (h *roomHub) upsertHumanPlayerConfigLocked(room *room, playerID string, name string, slotIndex int) {
	startingBalance := defaultStartingBalance
	humanPlayers := anySlice(room.Settings["humanPlayers"])
	if slotIndex >= 0 && slotIndex < len(humanPlayers) {
		if value := intValue(anyMap(humanPlayers[slotIndex])["startingBalance"]); value >= minPlayableBalance {
			startingBalance = value
		}
	} else if value := intValue(room.Settings["humanStartingBalance"]); value >= minPlayableBalance {
		startingBalance = value
	}
	config := map[string]any{
		"id":              playerID,
		"name":            name,
		"isHuman":         true,
		"startingBalance": startingBalance,
	}
	replaced := false
	for index, entry := range room.Game.AllPlayerConfigs {
		if stringValue(entry["id"]) == playerID {
			room.Game.AllPlayerConfigs[index] = config
			replaced = true
		}
	}
	if !replaced {
		room.Game.AllPlayerConfigs = append(room.Game.AllPlayerConfigs, config)
	}
	room.Game.AllPlayerConfigs = sortPlayerConfigsByTableSeatOrder(room, room.Game.AllPlayerConfigs)
	if room.Game.ChipTotals == nil {
		room.Game.ChipTotals = map[string]any{}
	}
	if _, exists := room.Game.ChipTotals[playerID]; !exists {
		room.Game.ChipTotals[playerID] = map[string]any{
			"chipBalance": startingBalance,
			"chipsWon":    0,
		}
	}
}

func (h *roomHub) cardPeekState(client *wsClient, message clientMessage) {
	h.mu.Lock()
	room := h.rooms[client.roomID]
	if room == nil || room.Game == nil || room.Game.State == nil || client.playerID == "" {
		h.mu.Unlock()
		return
	}
	if message.Peeking && !boolValue(room.Game.State["finished"]) {
		room.Game.CardPeekPlayerIDs[client.playerID] = true
	} else {
		delete(room.Game.CardPeekPlayerIDs, client.playerID)
	}
	h.mu.Unlock()
	h.broadcast(room)
}

func (h *roomHub) updateGameOptions(client *wsClient, message clientMessage) {
	h.mu.Lock()
	room := h.rooms[client.roomID]
	if room == nil || room.Game == nil {
		h.mu.Unlock()
		client.sendError("진행 중인 멀티플레이 게임이 없습니다.")
		return
	}
	if room.Tournament != nil {
		h.mu.Unlock()
		client.sendError("진행 중인 토너먼트 설정은 변경할 수 없습니다.")
		return
	}
	if room.HostPlayerID != client.playerID {
		h.mu.Unlock()
		client.sendError("방장만 게임 설정을 변경할 수 있습니다.")
		return
	}
	raw := message.Raw
	if _, ok := raw["autoNextHand"]; ok {
		room.Game.AutoNextHand = boolValue(raw["autoNextHand"])
	}
	if _, ok := raw["endlessMode"]; ok {
		room.Game.EndlessMode = boolValue(raw["endlessMode"])
	}
	if _, ok := raw["endlessReplacementComputerStyle"]; ok {
		room.Game.EndlessReplacementComputerStyle = sanitizeComputerStyleKey(stringValue(raw["endlessReplacementComputerStyle"]))
	}
	if _, ok := raw["endlessReplacementComputerLevel"]; ok {
		room.Game.EndlessReplacementComputerLevel = sanitizeComputerLevelKey(stringValue(raw["endlessReplacementComputerLevel"]))
	}
	if _, ok := raw["endlessReplacementStartingBalance"]; ok {
		room.Game.EndlessReplacementStartingBalance = clampInt(raw["endlessReplacementStartingBalance"], minPlayableBalance, 1_000_000_000, defaultStartingBalance)
	}
	if _, ok := raw["computerActionDelayMs"]; ok {
		room.Game.ComputerActionDelayMs = clampInt(raw["computerActionDelayMs"], minComputerActionDelayMs, maxComputerActionDelayMs, defaultComputerActionDelayMs)
	}
	if _, ok := raw["nextHandDelayMs"]; ok {
		room.Game.NextHandDelayMs = clampInt(raw["nextHandDelayMs"], minNextHandDelayMs, maxNextHandDelayMs, defaultNextHandDelayMs)
	}
	if _, ok := raw["humanActionTimeoutMs"]; ok {
		room.Game.HumanActionTimeoutMs = clampInt(raw["humanActionTimeoutMs"], minHumanActionTimeoutMs, maxHumanActionTimeoutMs, defaultHumanActionTimeoutMs)
	}
	if _, ok := raw["showComputerStyles"]; ok {
		room.Game.ShowComputerStyles = boolValue(raw["showComputerStyles"])
	}
	if _, ok := raw["showCumulativeWins"]; ok {
		room.Game.ShowCumulativeWins = boolValue(raw["showCumulativeWins"])
	}
	room.Settings = normalizeRoomSettingsFor(room, mergeSettings(room.Settings, map[string]any{
		"autoNextHand":                      room.Game.AutoNextHand,
		"endlessMode":                       room.Game.EndlessMode,
		"endlessReplacementComputerStyle":   room.Game.EndlessReplacementComputerStyle,
		"endlessReplacementComputerLevel":   room.Game.EndlessReplacementComputerLevel,
		"endlessReplacementStartingBalance": room.Game.EndlessReplacementStartingBalance,
		"showComputerStyles":                room.Game.ShowComputerStyles,
		"showCumulativeWins":                room.Game.ShowCumulativeWins,
		"computerActionDelayMs":             room.Game.ComputerActionDelayMs,
		"nextHandDelayMs":                   room.Game.NextHandDelayMs,
		"humanActionTimeoutMs":              room.Game.HumanActionTimeoutMs,
	}))
	roomID := room.ID
	h.mu.Unlock()
	h.scheduleRoomAutomation(roomID)
}
