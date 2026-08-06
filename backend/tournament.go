package main

import (
	"errors"
	"fmt"
	"sort"
	"time"
)

const (
	tournamentStatusRegistering = "registering"
	tournamentStatusRunning     = "running"
	tournamentStatusFinished    = "finished"
)

type tournamentParticipant struct {
	ID              string
	Name            string
	IsHuman         bool
	EntryIndex      int
	StartingBalance int
	ComputerStyle   string
	ComputerLevel   string
	ChipBalance     int
	ChipsWon        int
	Connected       bool
	Eliminated      bool
	Placement       int
	TableNumber     int
	TableRoomID     string
}

type tournamentBlindLevel struct {
	Number           int
	RoundInLevel     int
	RoundsPerLevel   int
	BettingScale     int
	SmallBlindAmount int
	BigBlindAmount   int
}

func blindLevelForTournamentRound(round int) tournamentBlindLevel {
	normalizedRound := round
	if normalizedRound < 1 {
		normalizedRound = 1
	}
	level := ((normalizedRound - 1) / tournamentRoundsPerBlindLevel) + 1
	roundInLevel := ((normalizedRound - 1) % tournamentRoundsPerBlindLevel) + 1
	if level > maxTournamentBlindLevel {
		level = maxTournamentBlindLevel
		roundInLevel = tournamentRoundsPerBlindLevel
	}
	bettingScale := 1 << (level - 1)
	return tournamentBlindLevel{
		Number:           level,
		RoundInLevel:     roundInLevel,
		RoundsPerLevel:   tournamentRoundsPerBlindLevel,
		BettingScale:     bettingScale,
		SmallBlindAmount: smallBlindAmount * bettingScale,
		BigBlindAmount:   bigBlindAmount * bettingScale,
	}
}

type tournament struct {
	ID                       string
	HostPlayerID             string
	Status                   string
	InitialParticipantCount  int
	HumanParticipantCount    int
	ComputerParticipantCount int
	StartingBalance          int
	Settings                 map[string]any
	Round                    int
	Participants             map[string]*tournamentParticipant
	EntryOrder               []string
	TableRoomIDs             []string
	WinnerID                 string
	FeeTotal                 int
	PlayerStats              map[string]any
	SettledHandIDs           map[string]bool
	AdvanceTimer             *time.Timer
	AdvanceScheduledAt       int64
	CleanupTimer             *time.Timer
}

func newTournament(id string, hostPlayerID string, settings map[string]any) *tournament {
	initialCount := clampInt(settings["initialParticipantCount"], 2, maxTournamentPlayers, 2)
	humanCount := clampInt(settings["humanParticipantCount"], 1, initialCount, 1)
	startingBalance := clampInt(settings["tournamentStartingBalance"], minPlayableBalance, 1_000_000_000, defaultStartingBalance)
	return &tournament{
		ID:                       id,
		HostPlayerID:             hostPlayerID,
		Status:                   tournamentStatusRegistering,
		InitialParticipantCount:  initialCount,
		HumanParticipantCount:    humanCount,
		ComputerParticipantCount: initialCount - humanCount,
		StartingBalance:          startingBalance,
		Settings:                 normalizeTournamentSettings(settings, nil),
		Participants:             map[string]*tournamentParticipant{},
		EntryOrder:               []string{},
		TableRoomIDs:             []string{id},
		PlayerStats:              map[string]any{},
		SettledHandIDs:           map[string]bool{},
	}
}

func normalizeTournamentSettings(settings map[string]any, fallback *tournament) map[string]any {
	if settings == nil {
		settings = map[string]any{}
	}
	defaultInitial := 2
	defaultHuman := 1
	defaultBalance := defaultStartingBalance
	if fallback != nil {
		defaultInitial = fallback.InitialParticipantCount
		defaultHuman = fallback.HumanParticipantCount
		defaultBalance = fallback.StartingBalance
	}
	initialCount := clampInt(settings["initialParticipantCount"], 2, maxTournamentPlayers, defaultInitial)
	humanCount := clampInt(settings["humanParticipantCount"], 1, initialCount, defaultHuman)
	singlePlayerTournament := boolValue(settings["singlePlayerTournament"])
	if singlePlayerTournament {
		humanCount = 1
	}
	startingBalance := clampInt(settings["tournamentStartingBalance"], minPlayableBalance, 1_000_000_000, defaultBalance)
	return map[string]any{
		"tournamentMode":                    true,
		"singlePlayerTournament":            singlePlayerTournament,
		"initialParticipantCount":           initialCount,
		"humanParticipantCount":             humanCount,
		"computerParticipantCount":          initialCount - humanCount,
		"tournamentStartingBalance":         startingBalance,
		"autoNextHand":                      true,
		"endlessMode":                       false,
		"showComputerStyles":                boolValueDefault(settings["showComputerStyles"], true),
		"showCumulativeWins":                boolValueDefault(settings["showCumulativeWins"], true),
		"computerActionDelayMs":             clampInt(settings["computerActionDelayMs"], minComputerActionDelayMs, maxComputerActionDelayMs, defaultComputerActionDelayMs),
		"nextHandDelayMs":                   clampInt(settings["nextHandDelayMs"], minNextHandDelayMs, maxNextHandDelayMs, defaultNextHandDelayMs),
		"humanActionTimeoutMs":              clampInt(settings["humanActionTimeoutMs"], minHumanActionTimeoutMs, maxHumanActionTimeoutMs, defaultHumanActionTimeoutMs),
		"randomizePlayerOrder":              true,
		"randomizeHumanSeats":               true,
		"computerStyle":                     sanitizeComputerStyleKey(stringValue(settings["computerStyle"])),
		"computerLevel":                     sanitizeComputerLevelKey(stringValue(settings["computerLevel"])),
		"endlessReplacementStartingBalance": startingBalance,
	}
}

func balancedTableSizes(participantCount int) []int {
	if participantCount <= 0 {
		return []int{}
	}
	tableCount := (participantCount + maxTotalPlayers - 1) / maxTotalPlayers
	baseSize := participantCount / tableCount
	extra := participantCount % tableCount
	sizes := make([]int, tableCount)
	for index := range sizes {
		sizes[index] = baseSize
		if index < extra {
			sizes[index]++
		}
	}
	return sizes
}

func shuffleTournamentParticipants(values []*tournamentParticipant) {
	for index := len(values) - 1; index > 0; index-- {
		swapIndex := secureRandomIndex(index + 1)
		values[index], values[swapIndex] = values[swapIndex], values[index]
	}
}

func allocateTournamentGroups(participants []*tournamentParticipant) [][]*tournamentParticipant {
	sizes := balancedTableSizes(len(participants))
	groups := make([][]*tournamentParticipant, len(sizes))
	overflow := []*tournamentParticipant{}
	sortedParticipants := append([]*tournamentParticipant{}, participants...)
	hasExistingAssignments := false
	for _, participant := range sortedParticipants {
		if participant.TableNumber > 0 {
			hasExistingAssignments = true
			break
		}
	}
	if hasExistingAssignments {
		sort.SliceStable(sortedParticipants, func(left int, right int) bool {
			if sortedParticipants[left].TableNumber != sortedParticipants[right].TableNumber {
				return sortedParticipants[left].TableNumber < sortedParticipants[right].TableNumber
			}
			return sortedParticipants[left].EntryIndex < sortedParticipants[right].EntryIndex
		})
	}

	for _, participant := range sortedParticipants {
		tableIndex := participant.TableNumber - 1
		if tableIndex >= 0 && tableIndex < len(groups) && len(groups[tableIndex]) < sizes[tableIndex] {
			groups[tableIndex] = append(groups[tableIndex], participant)
			continue
		}
		overflow = append(overflow, participant)
	}
	for tableIndex, size := range sizes {
		for len(groups[tableIndex]) < size && len(overflow) > 0 {
			groups[tableIndex] = append(groups[tableIndex], overflow[0])
			overflow = overflow[1:]
		}
	}
	return groups
}

func (h *roomHub) updateTournamentRegistrationLocked(room *room, settings map[string]any) error {
	value := room.Tournament
	if value == nil || value.Status != tournamentStatusRegistering {
		return errors.New("진행 중인 토너먼트 설정은 변경할 수 없습니다.")
	}
	normalized := normalizeTournamentSettings(mergeSettings(room.Settings, settings), value)
	nextHumanCount := intValue(normalized["humanParticipantCount"])
	if nextHumanCount < len(room.Seats) {
		for index := nextHumanCount; index < len(room.Seats); index++ {
			if room.Seats[index].PlayerID != "" {
				return errors.New("참가자가 연결된 인간 자리는 삭제할 수 없습니다.")
			}
		}
	}
	for len(room.Seats) < nextHumanCount {
		room.Seats = append(room.Seats, emptySeat(len(room.Seats)))
	}
	if len(room.Seats) > nextHumanCount {
		room.Seats = room.Seats[:nextHumanCount]
	}
	room.HumanSlots = nextHumanCount
	room.Settings = normalized
	value.InitialParticipantCount = intValue(normalized["initialParticipantCount"])
	value.HumanParticipantCount = nextHumanCount
	value.ComputerParticipantCount = intValue(normalized["computerParticipantCount"])
	value.StartingBalance = intValue(normalized["tournamentStartingBalance"])
	value.Settings = normalized
	return nil
}

func (h *roomHub) joinRunningTournament(client *wsClient, message clientMessage, tournamentID string) bool {
	h.mu.Lock()
	value := h.tournaments[tournamentID]
	if value == nil || value.Status == tournamentStatusRegistering {
		h.mu.Unlock()
		return false
	}
	requestedPlayerID := stringValue(message.PlayerID)
	participant := value.Participants[requestedPlayerID]
	if requestedPlayerID == "" || participant == nil || !participant.IsHuman {
		h.mu.Unlock()
		client.sendError("토너먼트 시작 후에는 새로운 참가자가 입장할 수 없습니다.")
		return true
	}
	if participant.Connected {
		h.mu.Unlock()
		client.sendError("이미 연결된 참가자입니다.")
		return true
	}
	if value.CleanupTimer != nil {
		value.CleanupTimer.Stop()
		value.CleanupTimer = nil
	}
	targetRoom := h.rooms[participant.TableRoomID]
	if targetRoom == nil && len(value.TableRoomIDs) > 0 {
		targetRoom = h.rooms[value.TableRoomIDs[0]]
	}
	if targetRoom == nil {
		h.mu.Unlock()
		client.sendError("참가자의 토너먼트 테이블을 찾을 수 없습니다.")
		return true
	}
	h.detachLocked(client, true)
	if participant.Name == "" {
		participant.Name = sanitizeName(message.PlayerName, defaultPlayerName)
	}
	participant.Connected = true
	if seat := targetRoom.seatByPlayerID(participant.ID); seat != nil {
		seat.Name = participant.Name
		seat.Connected = true
	}
	for _, config := range targetRoom.Game.AllPlayerConfigs {
		if stringValue(config["id"]) == participant.ID {
			config["name"] = participant.Name
		}
	}
	updateNamedEntries(anySlice(targetRoom.Game.State["playerConfigs"]), participant.ID, participant.Name)
	updateNamedEntries(anySlice(targetRoom.Game.State["players"]), participant.ID, participant.Name)
	targetRoom.clients[client] = struct{}{}
	client.roomID = targetRoom.ID
	client.playerID = participant.ID
	h.mu.Unlock()

	client.send(map[string]any{
		"type":                   "joinedRoom",
		"roomId":                 value.ID,
		"playerId":               participant.ID,
		"singlePlayerTournament": boolValue(value.Settings["singlePlayerTournament"]),
	})
	h.scheduleRoomAutomation(targetRoom.ID)
	h.broadcastTournament(value.ID)
	return true
}

func (h *roomHub) watchTournamentTable(client *wsClient, tableNumber int) {
	h.mu.Lock()
	homeRoom := h.rooms[client.roomID]
	if homeRoom == nil || homeRoom.Tournament == nil || homeRoom.Tournament.Status == tournamentStatusRegistering {
		h.mu.Unlock()
		client.sendError("진행 중인 토너먼트에 참가해야 다른 테이블을 관전할 수 있습니다.")
		return
	}
	targetRoom := h.tournamentTableRoomLocked(homeRoom.Tournament, tableNumber)
	if targetRoom == nil {
		h.mu.Unlock()
		client.sendError("관전할 토너먼트 테이블을 찾을 수 없습니다.")
		return
	}
	if targetRoom.ID == homeRoom.ID {
		client.viewingTournamentTableNumber = 0
	} else {
		client.viewingTournamentTableNumber = targetRoom.TableNumber
	}
	if tournamentRoomWaitingForPlayer(homeRoom, client.playerID) {
		client.viewingTournamentTableNumber = 0
	}
	h.mu.Unlock()
	h.sendRoomState(client)
}

func (h *roomHub) tournamentTableRoomLocked(value *tournament, tableNumber int) *room {
	if value == nil || tableNumber < 1 {
		return nil
	}
	for _, roomID := range value.TableRoomIDs {
		room := h.rooms[roomID]
		if room != nil && room.TableNumber == tableNumber {
			return room
		}
	}
	return nil
}

func tournamentRoomWaitingForPlayer(room *room, participantID string) bool {
	if room == nil || room.Game == nil || room.Game.State == nil || participantID == "" || boolValue(room.Game.State["finished"]) {
		return false
	}
	state := room.Game.State
	actor := playerAt(state, intValue(state["currentPlayerIndex"]))
	return boolValue(state["waitingForHuman"]) && playerID(actor) == participantID
}

func (h *roomHub) tournamentViewRoomLocked(homeRoom *room, client *wsClient) *room {
	if homeRoom == nil || homeRoom.Tournament == nil || client == nil {
		return homeRoom
	}
	if tournamentRoomWaitingForPlayer(homeRoom, client.playerID) {
		client.viewingTournamentTableNumber = 0
		return homeRoom
	}
	if client.viewingTournamentTableNumber <= 0 {
		return homeRoom
	}
	viewRoom := h.tournamentTableRoomLocked(homeRoom.Tournament, client.viewingTournamentTableNumber)
	if viewRoom == nil {
		client.viewingTournamentTableNumber = 0
		return homeRoom
	}
	return viewRoom
}

func (h *roomHub) sendRoomState(client *wsClient) {
	h.mu.Lock()
	homeRoom := h.rooms[client.roomID]
	viewRoom := h.tournamentViewRoomLocked(homeRoom, client)
	h.mu.Unlock()
	if homeRoom != nil {
		client.send(map[string]any{"type": "roomState", "room": h.publicRoom(homeRoom, viewRoom, client)})
	}
}

func (h *roomHub) startTournamentLocked(lobby *room, settings map[string]any) ([]string, error) {
	value := lobby.Tournament
	if value == nil || value.Status != tournamentStatusRegistering {
		return nil, errors.New("시작할 수 있는 토너먼트가 없습니다.")
	}
	if err := h.updateTournamentRegistrationLocked(lobby, settings); err != nil {
		return nil, err
	}
	for _, seat := range lobby.Seats {
		if seat.PlayerID == "" || !seat.Connected {
			return nil, errors.New("설정한 인간 참가자가 모두 연결되어야 토너먼트를 시작할 수 있습니다.")
		}
	}

	participants := make([]*tournamentParticipant, 0, value.InitialParticipantCount)
	value.Participants = map[string]*tournamentParticipant{}
	value.EntryOrder = []string{}
	for index, seat := range lobby.Seats {
		participant := &tournamentParticipant{
			ID:              seat.PlayerID,
			Name:            sanitizeName(seat.Name, "플레이어 "+strconvItoa(index+1)),
			IsHuman:         true,
			EntryIndex:      len(participants),
			StartingBalance: value.StartingBalance,
			ChipBalance:     value.StartingBalance,
			Connected:       true,
		}
		participants = append(participants, participant)
		value.Participants[participant.ID] = participant
		value.EntryOrder = append(value.EntryOrder, participant.ID)
	}
	computerStyle := sanitizeComputerStyleKey(stringValue(lobby.Settings["computerStyle"]))
	computerLevel := sanitizeComputerLevelKey(stringValue(lobby.Settings["computerLevel"]))
	for index := 0; index < value.ComputerParticipantCount; index++ {
		participant := &tournamentParticipant{
			ID:              fmt.Sprintf("%s-cpu-%d", value.ID, index+1),
			Name:            "컴퓨터 " + strconvItoa(index+1),
			IsHuman:         false,
			EntryIndex:      len(participants),
			StartingBalance: value.StartingBalance,
			ComputerStyle:   computerStyle,
			ComputerLevel:   computerLevel,
			ChipBalance:     value.StartingBalance,
			Connected:       true,
		}
		participants = append(participants, participant)
		value.Participants[participant.ID] = participant
		value.EntryOrder = append(value.EntryOrder, participant.ID)
	}
	shuffleTournamentParticipants(participants)
	value.Round = 1
	value.Status = tournamentStatusRunning
	groups := allocateTournamentGroups(participants)
	roomIDs, err := h.rebuildTournamentTablesLocked(value, lobby, groups)
	if err != nil {
		value.Status = tournamentStatusRegistering
		return nil, err
	}
	return roomIDs, nil
}

func (h *roomHub) buildTournamentGameLocked(room *room, participants []*tournamentParticipant, handNumber int, dealerPlayerID string) (*roomGame, error) {
	playerConfigs := make([]map[string]any, 0, len(participants))
	chipTotals := map[string]any{}
	computerStyles := map[string]any{}
	computerLevels := map[string]any{}
	tableSeatOrder := []map[string]any{}
	dealerIndex := 0
	computerCount := 0
	for index, participant := range participants {
		config := map[string]any{
			"id":              participant.ID,
			"name":            participant.Name,
			"isHuman":         participant.IsHuman,
			"startingBalance": participant.StartingBalance,
		}
		playerConfigs = append(playerConfigs, config)
		chipTotals[participant.ID] = map[string]any{
			"chipBalance": participant.ChipBalance,
			"chipsWon":    participant.ChipsWon,
		}
		if !participant.IsHuman {
			computerCount++
			computerStyles[participant.ID] = participant.ComputerStyle
			computerLevels[participant.ID] = participant.ComputerLevel
		}
		if participant.ID == dealerPlayerID {
			dealerIndex = index
		}
		tableSeatOrder = append(tableSeatOrder, map[string]any{
			"setupPlayerId": nil,
			"playerId":      participant.ID,
			"label":         participant.Name,
		})
	}
	for len(tableSeatOrder) < maxTotalPlayers {
		tableSeatOrder = append(tableSeatOrder, map[string]any{
			"setupPlayerId": nil,
			"playerId":      nil,
			"label":         "빈 자리 " + strconvItoa(len(tableSeatOrder)+1),
		})
	}
	blindLevel := blindLevelForTournamentRound(room.Tournament.Round)
	state, err := h.engine.startNewHand(map[string]any{
		"cpuCount":         computerCount,
		"includeHuman":     false,
		"dealerIndex":      dealerIndex,
		"chipTotals":       chipTotals,
		"feeTotal":         room.Tournament.FeeTotal,
		"handNumber":       handNumber,
		"smallBlindAmount": blindLevel.SmallBlindAmount,
		"bigBlindAmount":   blindLevel.BigBlindAmount,
		"bettingScale":     blindLevel.BettingScale,
		"computerStyles":   computerStyles,
		"computerLevels":   computerLevels,
		"endlessMode":      false,
		"playerStats":      room.Tournament.PlayerStats,
		"playerConfigs":    mapsToAny(playerConfigs),
	})
	if err != nil {
		return nil, err
	}
	resolvedStyles := anyMap(state["computerStyles"])
	resolvedLevels := anyMap(state["computerLevels"])
	for _, participant := range participants {
		if participant.IsHuman {
			continue
		}
		if style := stringValue(resolvedStyles[participant.ID]); style != "" {
			participant.ComputerStyle = style
		}
		if level := stringValue(resolvedLevels[participant.ID]); level != "" {
			participant.ComputerLevel = level
		}
	}
	settings := room.Settings
	return &roomGame{
		PlayerConfigs:                playerConfigs,
		AllPlayerConfigs:             playerConfigs,
		CPUCount:                     computerCount,
		ComputerStyles:               resolvedStyles,
		ComputerLevels:               resolvedLevels,
		State:                        state,
		TableSeatOrder:               tableSeatOrder,
		ChipTotals:                   anyMap(state["chipTotals"]),
		AutoNextHand:                 true,
		EndlessMode:                  false,
		ShowComputerStyles:           boolValueDefault(settings["showComputerStyles"], true),
		ShowCumulativeWins:           boolValueDefault(settings["showCumulativeWins"], true),
		ComputerActionDelayMs:        intValue(settings["computerActionDelayMs"]),
		NextHandDelayMs:              intValue(settings["nextHandDelayMs"]),
		HumanActionTimeoutMs:         intValue(settings["humanActionTimeoutMs"]),
		NextHandReadyPlayerIDs:       map[string]bool{},
		CardPeekPlayerIDs:            map[string]bool{},
		ComputerCardCheckedPlayerIDs: map[string]bool{},
	}, nil
}

func nextTournamentDealerID(room *room, active map[string]bool) string {
	if room == nil || room.Game == nil || room.Game.State == nil {
		return ""
	}
	players := statePlayers(room.Game.State)
	if len(players) == 0 {
		return ""
	}
	dealerIndex := intValue(room.Game.State["dealerIndex"])
	for offset := 1; offset <= len(players); offset++ {
		index := (dealerIndex + offset + len(players)) % len(players)
		id := playerID(anyMap(players[index]))
		if active[id] {
			return id
		}
	}
	return ""
}

func (h *roomHub) rebuildTournamentTablesLocked(value *tournament, lobby *room, groups [][]*tournamentParticipant) ([]string, error) {
	oldRooms := map[string]*room{}
	allClients := map[*wsClient]struct{}{}
	nextDealerByTable := map[int]string{}
	activeIDs := map[string]bool{}
	for _, group := range groups {
		for _, participant := range group {
			activeIDs[participant.ID] = true
		}
	}
	for _, roomID := range value.TableRoomIDs {
		if existing := h.rooms[roomID]; existing != nil {
			oldRooms[roomID] = existing
			nextDealerByTable[existing.TableNumber] = nextTournamentDealerID(existing, activeIDs)
			for client := range existing.clients {
				allClients[client] = struct{}{}
			}
			if existing.AutomationTimer != nil {
				existing.AutomationTimer.Stop()
			}
			if existing.ComputerPeekTimer != nil {
				existing.ComputerPeekTimer.Stop()
			}
		}
	}
	if lobby != nil {
		oldRooms[value.ID] = lobby
		for client := range lobby.clients {
			allClients[client] = struct{}{}
		}
	}

	roomIDs := make([]string, len(groups))
	rooms := make([]*room, len(groups))
	for tableIndex, group := range groups {
		internalID := value.ID
		if tableIndex > 0 {
			internalID = fmt.Sprintf("%s-T%d", value.ID, tableIndex+1)
		}
		roomIDs[tableIndex] = internalID
		tableRoom := oldRooms[internalID]
		if tableRoom == nil {
			tableRoom = &room{
				ID:                  internalID,
				HostPlayerID:        value.HostPlayerID,
				CreatedAt:           time.Now().UnixMilli(),
				WaitingParticipants: []waitingParticipant{},
			}
		}
		tableRoom.Tournament = value
		tableRoom.TableNumber = tableIndex + 1
		tableRoom.Settings = normalizeTournamentSettings(value.Settings, value)
		tableRoom.clients = map[*wsClient]struct{}{}
		tableRoom.WaitingParticipants = []waitingParticipant{}
		tableRoom.Seats = []seat{}
		for _, participant := range group {
			participant.TableNumber = tableIndex + 1
			participant.TableRoomID = internalID
			if participant.IsHuman {
				tableRoom.Seats = append(tableRoom.Seats, seat{
					ID:        humanSlotID(len(tableRoom.Seats)),
					Label:     participant.Name,
					PlayerID:  participant.ID,
					Name:      participant.Name,
					Connected: participant.Connected,
				})
			}
		}
		tableRoom.HumanSlots = len(tableRoom.Seats)
		game, err := h.buildTournamentGameLocked(tableRoom, group, value.Round, nextDealerByTable[tableIndex+1])
		if err != nil {
			return nil, err
		}
		tableRoom.Game = game
		h.rooms[internalID] = tableRoom
		rooms[tableIndex] = tableRoom
	}

	for client := range allClients {
		participant := value.Participants[client.playerID]
		targetIndex := 0
		if participant != nil && !participant.Eliminated && participant.TableNumber > 0 && participant.TableNumber <= len(rooms) {
			targetIndex = participant.TableNumber - 1
		}
		rooms[targetIndex].clients[client] = struct{}{}
		client.roomID = rooms[targetIndex].ID
		if client.viewingTournamentTableNumber > len(rooms) {
			client.viewingTournamentTableNumber = 0
		}
	}
	for roomID, existing := range oldRooms {
		if !containsString(roomIDs, roomID) {
			delete(h.rooms, roomID)
			existing.clients = map[*wsClient]struct{}{}
		}
	}
	value.TableRoomIDs = roomIDs
	return roomIDs, nil
}

func (h *roomHub) syncTournamentParticipantsLocked(value *tournament) {
	if value == nil || value.Status == tournamentStatusRegistering {
		return
	}
	newlyEliminated := []*tournamentParticipant{}
	for _, roomID := range value.TableRoomIDs {
		room := h.rooms[roomID]
		if room == nil || room.Game == nil || room.Game.State == nil {
			continue
		}
		for _, config := range room.Game.AllPlayerConfigs {
			participant := value.Participants[stringValue(config["id"])]
			if participant == nil {
				continue
			}
			participant.Name = stringValue(config["name"])
			participant.TableNumber = room.TableNumber
			participant.TableRoomID = room.ID
			ledger := anyMap(room.Game.ChipTotals[participant.ID])
			participant.ChipBalance = intValue(ledger["chipBalance"])
			participant.ChipsWon = intValue(ledger["chipsWon"])
			if participant.IsHuman {
				if seat := room.seatByPlayerID(participant.ID); seat != nil {
					participant.Connected = seat.Connected
				}
			} else {
				participant.ComputerStyle = stringValue(room.Game.ComputerStyles[participant.ID])
				participant.ComputerLevel = stringValue(room.Game.ComputerLevels[participant.ID])
			}
			player := playerAt(room.Game.State, statePlayerIndexByID(room.Game.State, participant.ID))
			isEliminated := boolValue(player["eliminated"]) || (boolValue(room.Game.State["finished"]) && participant.ChipBalance < minPlayableBalance)
			if isEliminated && !participant.Eliminated {
				participant.Eliminated = true
				newlyEliminated = append(newlyEliminated, participant)
			}
		}
		if boolValue(room.Game.State["finished"]) {
			handKey := fmt.Sprintf("%s:%d", room.ID, intValue(room.Game.State["handNumber"]))
			if !value.SettledHandIDs[handKey] {
				value.SettledHandIDs[handKey] = true
				value.FeeTotal += intValue(room.Game.State["currentHandFee"])
			}
		}
		for key, entry := range anyMap(room.Game.State["playerStats"]) {
			value.PlayerStats[key] = entry
		}
	}
	if len(newlyEliminated) > 0 {
		activeCount := 0
		for _, participant := range value.Participants {
			if !participant.Eliminated {
				activeCount++
			}
		}
		placement := activeCount + 1
		for _, participant := range newlyEliminated {
			participant.Placement = placement
		}
	}
}

func activeTournamentParticipants(value *tournament) []*tournamentParticipant {
	result := []*tournamentParticipant{}
	for _, id := range value.EntryOrder {
		participant := value.Participants[id]
		if participant != nil && !participant.Eliminated {
			result = append(result, participant)
		}
	}
	return result
}

func (h *roomHub) allTournamentTablesFinishedLocked(value *tournament) bool {
	if value == nil || len(value.TableRoomIDs) == 0 {
		return false
	}
	for _, roomID := range value.TableRoomIDs {
		room := h.rooms[roomID]
		if room == nil || room.Game == nil || room.Game.State == nil || !boolValue(room.Game.State["finished"]) {
			return false
		}
	}
	return true
}

func (h *roomHub) finishTournamentLocked(value *tournament, active []*tournamentParticipant) {
	value.Status = tournamentStatusFinished
	value.AdvanceScheduledAt = 0
	if value.AdvanceTimer != nil {
		value.AdvanceTimer.Stop()
		value.AdvanceTimer = nil
	}
	if len(active) == 1 {
		active[0].Placement = 1
		value.WinnerID = active[0].ID
	}
	for _, roomID := range value.TableRoomIDs {
		room := h.rooms[roomID]
		if room == nil || room.Game == nil || room.Game.State == nil {
			continue
		}
		room.Game.State["finished"] = true
		room.Game.State["gameOver"] = true
		if value.WinnerID != "" {
			room.Game.State["winnerIds"] = []any{value.WinnerID}
		}
	}
	h.scheduleFinishedTournamentCleanupLocked(value)
}

func (h *roomHub) scheduleFinishedTournamentCleanupLocked(value *tournament) {
	if value == nil || value.Status != tournamentStatusFinished {
		return
	}
	for _, roomID := range value.TableRoomIDs {
		if room := h.rooms[roomID]; room != nil && len(room.clients) > 0 {
			return
		}
	}
	if value.CleanupTimer != nil {
		value.CleanupTimer.Stop()
	}
	tournamentID := value.ID
	value.CleanupTimer = time.AfterFunc(emptyRoomTTL, func() {
		h.mu.Lock()
		defer h.mu.Unlock()
		current := h.tournaments[tournamentID]
		if current == nil || current.Status != tournamentStatusFinished {
			return
		}
		for _, roomID := range current.TableRoomIDs {
			if room := h.rooms[roomID]; room != nil && len(room.clients) > 0 {
				return
			}
		}
		for _, roomID := range current.TableRoomIDs {
			if room := h.rooms[roomID]; room != nil {
				if room.AutomationTimer != nil {
					room.AutomationTimer.Stop()
				}
				if room.ComputerPeekTimer != nil {
					room.ComputerPeekTimer.Stop()
				}
			}
			delete(h.rooms, roomID)
		}
		delete(h.tournaments, tournamentID)
	})
}

func (h *roomHub) scheduleTournamentAdvance(tournamentID string) {
	h.mu.Lock()
	value := h.tournaments[tournamentID]
	if value == nil || value.Status != tournamentStatusRunning {
		h.mu.Unlock()
		return
	}
	h.syncTournamentParticipantsLocked(value)
	active := activeTournamentParticipants(value)
	if len(active) <= 1 {
		h.finishTournamentLocked(value, active)
		h.mu.Unlock()
		h.broadcastTournament(tournamentID)
		return
	}
	if !h.allTournamentTablesFinishedLocked(value) || value.AdvanceTimer != nil {
		h.mu.Unlock()
		h.broadcastTournament(tournamentID)
		return
	}
	delay := defaultNextHandDelayMs
	if len(value.TableRoomIDs) > 0 {
		if room := h.rooms[value.TableRoomIDs[0]]; room != nil && room.Game != nil {
			delay = room.Game.NextHandDelayMs
		}
	}
	value.AdvanceScheduledAt = time.Now().UnixMilli() + int64(delay)
	value.AdvanceTimer = time.AfterFunc(time.Duration(delay)*time.Millisecond, func() {
		h.advanceTournamentRound(tournamentID)
	})
	h.mu.Unlock()
	h.broadcastTournament(tournamentID)
}

func (h *roomHub) advanceTournamentRound(tournamentID string) {
	h.mu.Lock()
	value := h.tournaments[tournamentID]
	if value == nil || value.Status != tournamentStatusRunning || !h.allTournamentTablesFinishedLocked(value) {
		if value != nil {
			value.AdvanceTimer = nil
			value.AdvanceScheduledAt = 0
		}
		h.mu.Unlock()
		return
	}
	value.AdvanceTimer = nil
	value.AdvanceScheduledAt = 0
	h.syncTournamentParticipantsLocked(value)
	active := activeTournamentParticipants(value)
	if len(active) <= 1 {
		h.finishTournamentLocked(value, active)
		h.mu.Unlock()
		h.broadcastTournament(tournamentID)
		return
	}
	value.Round++
	groups := allocateTournamentGroups(active)
	roomIDs, err := h.rebuildTournamentTablesLocked(value, h.rooms[value.ID], groups)
	if err != nil {
		h.mu.Unlock()
		return
	}
	h.mu.Unlock()
	for _, roomID := range roomIDs {
		h.scheduleRoomAutomation(roomID)
	}
	h.broadcastTournament(tournamentID)
}

func (h *roomHub) broadcastTournament(tournamentID string) {
	h.mu.Lock()
	value := h.tournaments[tournamentID]
	clients := map[*wsClient]struct{}{}
	if value != nil {
		for _, roomID := range value.TableRoomIDs {
			if room := h.rooms[roomID]; room != nil {
				for client := range room.clients {
					clients[client] = struct{}{}
				}
			}
		}
	}
	h.mu.Unlock()
	for client := range clients {
		h.sendRoomState(client)
	}
}

func (h *roomHub) publicTournament(room *room) any {
	value := room.Tournament
	if value == nil {
		return nil
	}
	participants := make([]map[string]any, 0, len(value.Participants))
	for _, id := range value.EntryOrder {
		participant := value.Participants[id]
		if participant == nil {
			continue
		}
		participants = append(participants, map[string]any{
			"id":          participant.ID,
			"name":        participant.Name,
			"isHuman":     participant.IsHuman,
			"connected":   participant.Connected,
			"chipBalance": participant.ChipBalance,
			"eliminated":  participant.Eliminated,
			"placement":   participant.Placement,
			"tableNumber": participant.TableNumber,
		})
	}
	sort.SliceStable(participants, func(left int, right int) bool {
		leftPlacement := intValue(participants[left]["placement"])
		rightPlacement := intValue(participants[right]["placement"])
		if leftPlacement > 0 || rightPlacement > 0 {
			if leftPlacement == 0 {
				return true
			}
			if rightPlacement == 0 {
				return false
			}
			return leftPlacement < rightPlacement
		}
		return intValue(participants[left]["chipBalance"]) > intValue(participants[right]["chipBalance"])
	})
	activeCount := 0
	for _, participant := range value.Participants {
		if !participant.Eliminated {
			activeCount++
		}
	}
	winnerName := ""
	if winner := value.Participants[value.WinnerID]; winner != nil {
		winnerName = winner.Name
	}
	tables := make([]map[string]any, 0, len(value.TableRoomIDs))
	for index, roomID := range value.TableRoomIDs {
		tableRoom := h.rooms[roomID]
		participantCount := 0
		finished := false
		if tableRoom != nil && tableRoom.Game != nil && tableRoom.Game.State != nil {
			participantCount = len(statePlayers(tableRoom.Game.State))
			finished = boolValue(tableRoom.Game.State["finished"])
		}
		tableNumber := index + 1
		if tableRoom != nil && tableRoom.TableNumber > 0 {
			tableNumber = tableRoom.TableNumber
		}
		tables = append(tables, map[string]any{
			"tableNumber":      tableNumber,
			"participantCount": participantCount,
			"finished":         finished,
		})
	}
	blindLevel := blindLevelForTournamentRound(value.Round)
	return map[string]any{
		"id":                       value.ID,
		"status":                   value.Status,
		"singlePlayer":             boolValue(value.Settings["singlePlayerTournament"]),
		"initialParticipantCount":  value.InitialParticipantCount,
		"humanParticipantCount":    value.HumanParticipantCount,
		"computerParticipantCount": value.ComputerParticipantCount,
		"activeParticipantCount":   activeCount,
		"tableCount":               len(value.TableRoomIDs),
		"tableNumber":              room.TableNumber,
		"maxPlayersPerTable":       maxTotalPlayers,
		"round":                    value.Round,
		"blindLevel":               blindLevel.Number,
		"roundInBlindLevel":        blindLevel.RoundInLevel,
		"roundsPerBlindLevel":      blindLevel.RoundsPerLevel,
		"bettingMultiplier":        blindLevel.BettingScale,
		"smallBlindAmount":         blindLevel.SmallBlindAmount,
		"bigBlindAmount":           blindLevel.BigBlindAmount,
		"maxBlindLevel":            maxTournamentBlindLevel,
		"tables":                   tables,
		"winnerId":                 value.WinnerID,
		"winnerName":               winnerName,
		"advanceScheduledAt":       value.AdvanceScheduledAt,
		"participants":             participants,
	}
}
