package main

import (
	"errors"
	"fmt"
	"strings"
	"time"
)

func (h *roomHub) startRoomGame(client *wsClient, message clientMessage) {
	h.mu.Lock()
	room := h.rooms[client.roomID]
	if room == nil {
		h.mu.Unlock()
		client.sendError("먼저 멀티플레이 룸에 참가해야 합니다.")
		return
	}
	if room.HostPlayerID != client.playerID {
		h.mu.Unlock()
		client.sendError("방장만 게임 설정과 시작을 할 수 있습니다.")
		return
	}
	settingsPayload := message.Raw
	if message.Settings != nil {
		settingsPayload = mergeSettings(settingsPayload, message.Settings)
	}
	if players := anySlice(settingsPayload["humanPlayers"]); len(players) > 0 {
		room.HumanSlots = clamp(len(players), minHumanSlots, maxHumanSlots, room.HumanSlots)
		h.syncSeatsToSettings(room)
	}
	room.Settings = normalizeRoomSettingsFor(room, mergeSettings(room.Settings, settingsPayload))
	game, err := h.buildRoomGameLocked(room, room.Settings)
	if err != nil {
		h.mu.Unlock()
		client.sendError(err.Error())
		return
	}
	room.Game = game
	h.mu.Unlock()

	h.scheduleRoomAutomation(room.ID)
}

func (h *roomHub) buildRoomGameLocked(room *room, settings map[string]any) (*roomGame, error) {
	computerPlayers := []map[string]any{}
	for index, entry := range anySlice(settings["computerPlayers"]) {
		player := anyMap(entry)
		computerPlayers = append(computerPlayers, map[string]any{
			"id":              computerPlayerID(index),
			"name":            sanitizeName(stringValue(player["name"]), "컴퓨터 "+strconvItoa(index+1)),
			"isHuman":         false,
			"startingBalance": intValue(player["startingBalance"]),
			"computerStyle":   sanitizeComputerStyleKey(stringValue(player["computerStyle"])),
			"computerLevel":   sanitizeComputerLevelKey(stringValue(player["computerLevel"])),
		})
	}
	if room.HumanSlots+len(computerPlayers) > maxTotalPlayers {
		return nil, fmt.Errorf("인간 플레이어와 컴퓨터 플레이어를 합쳐 최대 %d명까지만 구성할 수 있습니다.", maxTotalPlayers)
	}

	connectedHumans := map[string]map[string]any{}
	humanPlayers := anySlice(settings["humanPlayers"])
	for index, seat := range room.Seats {
		if seat.PlayerID == "" || !seat.Connected || seatWillBeAwayNextHand(seat) {
			continue
		}
		startingBalance := defaultStartingBalance
		if index < len(humanPlayers) {
			startingBalance = intValue(anyMap(humanPlayers[index])["startingBalance"])
		}
		if startingBalance < 0 {
			startingBalance = 0
		}
		setupID := humanSlotID(index)
		connectedHumans[setupID] = map[string]any{
			"id":              seat.PlayerID,
			"name":            sanitizeName(seat.Name, "플레이어 "+strconvItoa(index+1)),
			"isHuman":         true,
			"startingBalance": startingBalance,
			"setupPlayerId":   setupID,
		}
	}

	computersByID := map[string]map[string]any{}
	for _, computer := range computerPlayers {
		computersByID[stringValue(computer["id"])] = computer
	}
	playerOrder := normalizePlayerOrder(settings["playerOrder"], room.HumanSlots, len(computerPlayers))
	if boolValue(settings["randomizePlayerOrder"]) {
		playerOrder = shuffledPlayerOrder(room.HumanSlots, len(computerPlayers))
	}

	orderedPlayers := []map[string]any{}
	tableSeatOrder := []map[string]any{}
	for index, setupID := range playerOrder {
		var player map[string]any
		label := "빈 자리 " + strconvItoa(index+1)
		playerID := ""
		if strings.HasPrefix(setupID, "human-slot-") {
			player = connectedHumans[setupID]
			slotIndex := intValue(strings.TrimPrefix(setupID, "human-slot-")) - 1
			if slotIndex >= 0 && slotIndex < len(room.Seats) {
				seat := room.Seats[slotIndex]
				playerID = seat.PlayerID
				if seat.Name != "" {
					label = seat.Name
				}
			}
		} else {
			player = computersByID[setupID]
			if player != nil {
				playerID = stringValue(player["id"])
				label = stringValue(player["name"])
			}
		}
		if player != nil {
			orderedPlayers = append(orderedPlayers, player)
		}
		tableSeatOrder = append(tableSeatOrder, map[string]any{
			"setupPlayerId": setupID,
			"playerId":      nullableString(playerID),
			"label":         label,
		})
	}
	for len(tableSeatOrder) < maxTotalPlayers {
		tableSeatOrder = append(tableSeatOrder, map[string]any{
			"setupPlayerId": nil,
			"playerId":      nil,
			"label":         "빈 자리 " + strconvItoa(len(tableSeatOrder)+1),
		})
	}

	if len(orderedPlayers) < 2 {
		return nil, errors.New("게임 시작에는 연결된 인간 또는 컴퓨터가 2명 이상 필요합니다.")
	}

	playerConfigs := make([]map[string]any, len(orderedPlayers))
	chipTotals := map[string]any{}
	for index, player := range orderedPlayers {
		config := map[string]any{
			"id":              stringValue(player["id"]),
			"name":            stringValue(player["name"]),
			"isHuman":         boolValue(player["isHuman"]),
			"startingBalance": intValue(player["startingBalance"]),
		}
		playerConfigs[index] = config
		chipTotals[stringValue(player["id"])] = map[string]any{
			"chipBalance": intValue(player["startingBalance"]),
			"chipsWon":    0,
		}
	}
	computerStyles := map[string]any{}
	computerLevels := map[string]any{}
	for _, computer := range computerPlayers {
		id := stringValue(computer["id"])
		computerStyles[id] = sanitizeComputerStyleKey(stringValue(computer["computerStyle"]))
		computerLevels[id] = sanitizeComputerLevelKey(stringValue(computer["computerLevel"]))
	}

	state, err := h.engine.startNewHand(map[string]any{
		"cpuCount":                          len(computerPlayers),
		"includeHuman":                      false,
		"dealerIndex":                       0,
		"chipTotals":                        chipTotals,
		"feeTotal":                          0,
		"handNumber":                        1,
		"computerStyles":                    computerStyles,
		"computerLevels":                    computerLevels,
		"endlessMode":                       boolValue(settings["endlessMode"]),
		"endlessReplacementComputerStyle":   stringValue(settings["endlessReplacementComputerStyle"]),
		"endlessReplacementComputerLevel":   stringValue(settings["endlessReplacementComputerLevel"]),
		"endlessReplacementStartingBalance": intValue(settings["endlessReplacementStartingBalance"]),
		"playerConfigs":                     mapsToAny(playerConfigs),
	})
	if err != nil {
		return nil, err
	}

	statePlayerConfigs := mapsFromAnySlice(anySlice(state["playerConfigs"]))
	return &roomGame{
		PlayerConfigs:                     statePlayerConfigs,
		AllPlayerConfigs:                  statePlayerConfigs,
		CPUCount:                          len(computerPlayers),
		ComputerStyles:                    computerStyles,
		ComputerLevels:                    computerLevels,
		State:                             state,
		TableSeatOrder:                    tableSeatOrder,
		ChipTotals:                        anyMap(state["chipTotals"]),
		AutoNextHand:                      boolValue(settings["autoNextHand"]),
		EndlessMode:                       boolValue(settings["endlessMode"]),
		EndlessReplacementComputerStyle:   stringValue(settings["endlessReplacementComputerStyle"]),
		EndlessReplacementComputerLevel:   stringValue(settings["endlessReplacementComputerLevel"]),
		EndlessReplacementStartingBalance: intValue(settings["endlessReplacementStartingBalance"]),
		ShowComputerStyles:                boolValueDefault(settings["showComputerStyles"], true),
		ShowCumulativeWins:                boolValueDefault(settings["showCumulativeWins"], true),
		ComputerActionDelayMs:             intValue(settings["computerActionDelayMs"]),
		NextHandDelayMs:                   intValue(settings["nextHandDelayMs"]),
		HumanActionTimeoutMs:              intValue(settings["humanActionTimeoutMs"]),
		NextHandReadyPlayerIDs:            map[string]bool{},
		CardPeekPlayerIDs:                 map[string]bool{},
		ComputerCardCheckedPlayerIDs:      map[string]bool{},
	}, nil
}

func nullableString(value string) any {
	if value == "" {
		return nil
	}
	return value
}

func mapsToAny(values []map[string]any) []any {
	result := make([]any, len(values))
	for index, value := range values {
		result[index] = value
	}
	return result
}

func mapsFromAnySlice(values []any) []map[string]any {
	result := make([]map[string]any, 0, len(values))
	for _, value := range values {
		result = append(result, anyMap(value))
	}
	return result
}

func (h *roomHub) handleGameAction(client *wsClient, message clientMessage) {
	if !h.applyRoomAction(client.roomID, message.Action, client.playerID, false, "") {
		client.sendError("해당 행동을 적용할 수 없습니다.")
	}
}

func (h *roomHub) applyRoomAction(roomID string, action string, actorPlayerID string, timedOut bool, autoReason string) bool {
	h.mu.Lock()
	room := h.rooms[roomID]
	if room == nil || room.Game == nil || room.Game.State == nil || boolValue(room.Game.State["finished"]) {
		h.mu.Unlock()
		return false
	}
	state := room.Game.State
	actorIndex := intValue(state["currentPlayerIndex"])
	if actorPlayerID != "" {
		actorIndex = statePlayerIndexByID(state, actorPlayerID)
	}
	if actorIndex < 0 {
		h.mu.Unlock()
		return false
	}
	if timedOut || autoReason != "" {
		actor := playerAt(state, actorIndex)
		logEntries := append([]any{}, anySlice(state["log"])...)
		if timedOut {
			logEntries = append(logEntries, playerName(actor)+": 제한 시간 초과")
		} else if autoReason != "" {
			logEntries = append(logEntries, playerName(actor)+": "+autoReason)
		}
		state = cloneMap(state)
		state["log"] = logEntries
	}
	nextState, changed, err := h.engine.applyAction(state, action, actorIndex)
	if err != nil || !changed {
		h.mu.Unlock()
		return false
	}
	room.Game.State = nextState
	room.Game.ChipTotals = mergeChipTotals(room.Game.ChipTotals, nextState["chipTotals"])
	if styles := anyMap(nextState["computerStyles"]); len(styles) > 0 {
		room.Game.ComputerStyles = styles
	}
	if levels := anyMap(nextState["computerLevels"]); len(levels) > 0 {
		room.Game.ComputerLevels = levels
	}
	roomID = room.ID
	h.mu.Unlock()

	h.scheduleRoomAutomation(roomID)
	return true
}

func (h *roomHub) requestNextHand(client *wsClient) {
	h.mu.Lock()
	room := h.rooms[client.roomID]
	if room == nil || room.Game == nil || room.Game.State == nil {
		h.mu.Unlock()
		client.sendError("진행 중인 멀티플레이 게임이 없습니다.")
		return
	}
	if !boolValue(room.Game.State["finished"]) || boolValue(room.Game.State["gameOver"]) {
		h.mu.Unlock()
		client.sendError("다음 핸드를 시작할 수 있는 상태가 아닙니다.")
		return
	}
	required := h.nextHandRequiredPlayerIDs(room)
	if !containsString(required, client.playerID) {
		h.mu.Unlock()
		client.sendError("다음 핸드 진행 확인 대상이 아닙니다.")
		return
	}
	room.Game.NextHandReadyPlayerIDs[client.playerID] = true
	ready := h.allRequiredPlayersReady(room)
	roomID := room.ID
	h.mu.Unlock()
	if ready {
		h.startNextRoomHand(roomID)
		return
	}
	h.broadcastByID(roomID)
}

func (h *roomHub) startNextRoomHand(roomID string) {
	h.mu.Lock()
	room := h.rooms[roomID]
	if room == nil || room.Game == nil || room.Game.State == nil || boolValue(room.Game.State["gameOver"]) {
		h.mu.Unlock()
		return
	}
	currentState := room.Game.State
	nextHandNumber := intValue(currentState["handNumber"]) + 1
	participationLog := []any{}
	participationLog = append(participationLog, h.applySeatParticipationReservationsLocked(room, currentState)...)
	participationLog = append(participationLog, h.applyEndlessHumanJoinReservationsLocked(room, currentState)...)
	participationLog = append(participationLog, h.recordMissedBlindsForAwaySeatsLocked(room, currentState)...)
	playerConfigs := h.activePlayerConfigsForNextHandLocked(room)
	nextDealerIndex := h.nextDealerIndexForPlayerConfigsLocked(room, currentState, playerConfigs)
	forcedContributions := h.missedBlindForcedContributionsLocked(room, playerConfigs)
	if len(playerConfigs) < 2 {
		room.Game.State["gameOver"] = true
		room.Game.State["finished"] = true
		logEntries := append([]any{}, anySlice(room.Game.State["log"])...)
		logEntries = append(logEntries, "진행 가능한 플레이어가 2명 미만이어서 게임을 종료합니다.")
		room.Game.State["log"] = logEntries
		h.mu.Unlock()
		h.broadcastByID(roomID)
		return
	}
	state, err := h.engine.startNewHand(map[string]any{
		"cpuCount":                          room.Game.CPUCount,
		"includeHuman":                      false,
		"dealerIndex":                       nextDealerIndex,
		"chipTotals":                        room.Game.ChipTotals,
		"feeTotal":                          currentState["feeTotal"],
		"handNumber":                        nextHandNumber,
		"computerStyles":                    room.Game.ComputerStyles,
		"computerLevels":                    room.Game.ComputerLevels,
		"endlessMode":                       room.Game.EndlessMode,
		"endlessReplacementComputerStyle":   room.Game.EndlessReplacementComputerStyle,
		"endlessReplacementComputerLevel":   room.Game.EndlessReplacementComputerLevel,
		"endlessReplacementStartingBalance": room.Game.EndlessReplacementStartingBalance,
		"playerStats":                       currentState["playerStats"],
		"playerConfigs":                     mapsToAny(playerConfigs),
		"forcedContributions":               forcedContributions,
	})
	if err != nil {
		h.mu.Unlock()
		return
	}
	if len(participationLog) > 0 {
		state["log"] = append(participationLog, anySlice(state["log"])...)
	}
	room.Game.State = state
	room.Game.PlayerConfigs = mapsFromAnySlice(anySlice(state["playerConfigs"]))
	syncAllPlayerConfigsLocked(room, playerConfigs, room.Game.PlayerConfigs)
	syncTableSeatOrderLocked(room, playerConfigs, room.Game.PlayerConfigs)
	room.Game.ChipTotals = mergeChipTotals(room.Game.ChipTotals, state["chipTotals"])
	if styles := anyMap(state["computerStyles"]); len(styles) > 0 {
		room.Game.ComputerStyles = styles
	}
	if levels := anyMap(state["computerLevels"]); len(levels) > 0 {
		room.Game.ComputerLevels = levels
	}
	room.Game.NextHandReadyPlayerIDs = map[string]bool{}
	room.Game.CardPeekPlayerIDs = map[string]bool{}
	room.Game.ComputerCardCheckedPlayerIDs = map[string]bool{}
	h.mu.Unlock()

	h.scheduleRoomAutomation(roomID)
}

func (h *roomHub) activePlayerConfigsForNextHandLocked(room *room) []map[string]any {
	configs := room.Game.AllPlayerConfigs
	if len(configs) == 0 {
		configs = room.Game.PlayerConfigs
	}
	result := []map[string]any{}
	for _, config := range configs {
		id := stringValue(config["id"])
		ledger := anyMap(room.Game.ChipTotals[id])
		if boolValue(config["isHuman"]) {
			if intValue(ledger["chipBalance"]) < minPlayableBalance {
				continue
			}
			seat := room.seatByPlayerID(id)
			if seat == nil || !seatWillParticipateNextHand(*seat) {
				continue
			}
		} else if !room.Game.EndlessMode && intValue(ledger["chipBalance"]) < minPlayableBalance {
			continue
		}
		result = append(result, config)
	}
	return result
}

func (h *roomHub) scheduleRoomAutomation(roomID string) {
	h.mu.Lock()
	room := h.rooms[roomID]
	if room == nil || room.Game == nil || room.Game.State == nil {
		h.mu.Unlock()
		return
	}
	if room.AutomationTimer != nil {
		room.AutomationTimer.Stop()
		room.AutomationTimer = nil
	}
	if room.ComputerPeekTimer != nil {
		room.ComputerPeekTimer.Stop()
		room.ComputerPeekTimer = nil
	}
	room.Game.Timer = nil
	state := room.Game.State
	if len(room.clients) == 0 {
		h.mu.Unlock()
		return
	}

	if boolValue(state["finished"]) {
		if !boolValue(state["gameOver"]) && (room.Game.AutoNextHand || len(h.nextHandRequiredPlayerIDs(room)) == 0) {
			h.scheduleRoomTimerLocked(room, "autoNextHand", "", "", room.Game.NextHandDelayMs, func() {
				h.startNextRoomHand(roomID)
			})
		} else if !boolValue(state["gameOver"]) {
			h.scheduleRoomTimerLocked(room, "nextHandReady", "", "", room.Game.HumanActionTimeoutMs, func() {
				h.startNextRoomHand(roomID)
			})
		}
		h.mu.Unlock()
		h.broadcastByID(roomID)
		return
	}

	actorIndex := intValue(state["currentPlayerIndex"])
	actor := playerAt(state, actorIndex)
	if actor == nil || playerID(actor) == "" {
		h.mu.Unlock()
		h.broadcastByID(roomID)
		return
	}
	if !boolValue(actor["isHuman"]) {
		planState := cloneMap(state)
		planState["computerCardCheckedPlayerIds"] = keysFromSet(room.Game.ComputerCardCheckedPlayerIDs)
		peekPlan, _ := h.engine.computerCardPeekPlan(planState, actorIndex, room.Game.ComputerActionDelayMs)
		shouldPeek := boolValue(peekPlan["shouldPeek"])
		duration := intValue(peekPlan["durationMs"])
		actorID := playerID(actor)
		if shouldPeek {
			room.Game.ComputerCardCheckedPlayerIDs[actorID] = true
			room.Game.CardPeekPlayerIDs[actorID] = true
			room.ComputerPeekTimer = time.AfterFunc(time.Duration(duration)*time.Millisecond, func() {
				h.mu.Lock()
				if current := h.rooms[roomID]; current != nil && current.Game != nil {
					delete(current.Game.CardPeekPlayerIDs, actorID)
				}
				h.mu.Unlock()
				h.broadcastByID(roomID)
			})
		}
		delay := room.Game.ComputerActionDelayMs
		if shouldPeek && delay < duration+80 {
			delay = duration + 80
		}
		room.AutomationTimer = time.AfterFunc(time.Duration(delay)*time.Millisecond, func() {
			h.mu.Lock()
			current := h.rooms[roomID]
			if current == nil || current.Game == nil || current.Game.State == nil {
				h.mu.Unlock()
				return
			}
			delete(current.Game.CardPeekPlayerIDs, actorID)
			decisionState := cloneMap(current.Game.State)
			decisionState["cardPeekPlayerIds"] = keysFromSet(current.Game.CardPeekPlayerIDs)
			action, err := h.engine.chooseComputerAction(decisionState, intValue(decisionState["currentPlayerIndex"]))
			h.mu.Unlock()
			if err == nil && action != "" {
				h.applyRoomAction(roomID, action, "", false, "")
			}
		})
		h.mu.Unlock()
		h.broadcastByID(roomID)
		return
	}

	if seat := room.seatByPlayerID(playerID(actor)); seat != nil && !seat.Connected && seat.PendingStandUp {
		action := "fold"
		if boolValue(state["showdownPending"]) {
			action = "muck"
		}
		h.mu.Unlock()
		h.applyRoomAction(roomID, action, playerID(actor), false, "연결 끊김 자동 처리")
		return
	}

	actorID := playerID(actor)
	h.scheduleRoomTimerLocked(room, "humanAction", actorID, playerName(actor), room.Game.HumanActionTimeoutMs, func() {
		h.applyRoomAction(roomID, timeoutActionForRoom(roomID, h), actorID, true, "")
	})
	h.mu.Unlock()
	h.broadcastByID(roomID)
}

func timeoutActionForRoom(roomID string, h *roomHub) string {
	h.mu.Lock()
	defer h.mu.Unlock()
	room := h.rooms[roomID]
	if room == nil || room.Game == nil || room.Game.State == nil {
		return "fold"
	}
	if boolValue(room.Game.State["showdownPending"]) {
		return "muck"
	}
	return "fold"
}

func (h *roomHub) scheduleRoomTimerLocked(room *room, phase string, playerID string, playerName string, durationMs int, callback func()) {
	now := time.Now().UnixMilli()
	room.Game.TimerID++
	timerID := room.Game.TimerID
	if durationMs < 0 {
		durationMs = 0
	}
	room.Game.Timer = &roomTimer{
		ID:         timerID,
		Phase:      phase,
		PlayerID:   playerID,
		PlayerName: playerName,
		StartedAt:  now,
		ExpiresAt:  now + int64(durationMs),
		DurationMs: durationMs,
	}
	room.AutomationTimer = time.AfterFunc(time.Duration(durationMs)*time.Millisecond, func() {
		h.mu.Lock()
		current := h.rooms[room.ID]
		if current == nil || current.Game == nil || current.Game.Timer == nil || current.Game.Timer.ID != timerID {
			h.mu.Unlock()
			return
		}
		current.Game.Timer = nil
		h.mu.Unlock()
		callback()
	})
}

func (h *roomHub) broadcastByID(roomID string) {
	h.mu.Lock()
	room := h.rooms[roomID]
	h.mu.Unlock()
	if room != nil {
		h.broadcast(room)
	}
}
