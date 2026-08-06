package main

import "strings"

func (h *roomHub) publicRoom(homeRoom *room, viewRoom *room, client *wsClient) map[string]any {
	if viewRoom == nil {
		viewRoom = homeRoom
	}
	settings := publicRoomSettings(viewRoom)
	publicID := homeRoom.ID
	if homeRoom.Tournament != nil {
		publicID = homeRoom.Tournament.ID
	}
	tournament := h.publicTournament(viewRoom)
	if public, ok := tournament.(map[string]any); ok {
		public["homeTableNumber"] = homeRoom.TableNumber
		public["viewingTableNumber"] = viewRoom.TableNumber
		public["spectating"] = homeRoom.ID != viewRoom.ID
	}
	return map[string]any{
		"id":                        publicID,
		"humanSlots":                homeRoom.HumanSlots,
		"hostPlayerId":              homeRoom.HostPlayerID,
		"seats":                     publicSeats(homeRoom),
		"waitingParticipants":       homeRoom.WaitingParticipants,
		"createdAt":                 homeRoom.CreatedAt,
		"settings":                  settings,
		"showComputerStyles":        boolValueDefault(settings["showComputerStyles"], true),
		"showCumulativeWins":        boolValueDefault(settings["showCumulativeWins"], true),
		"nextHandRequiredPlayerIds": h.nextHandRequiredPlayerIDs(homeRoom),
		"nextHandReadyPlayerIds":    h.nextHandReadyPlayerIDs(homeRoom),
		"nextHandDealerPlayerId":    nil,
		"canReserveStandUpFromGame": homeRoom.Tournament == nil && homeRoom.Game != nil && homeRoom.Game.State != nil && client != nil && client.playerID != "",
		"cardPeekPlayerIds":         publicCardPeekPlayerIDs(viewRoom),
		"timer":                     publicRoomTimer(viewRoom),
		"gameState":                 h.publicGameState(viewRoom, client),
		"tournament":                tournament,
	}
}

func publicSeats(room *room) []seat {
	result := make([]seat, len(room.Seats))
	for index, entry := range room.Seats {
		next := entry
		next.MissedBlindAmount = missedBlindAmountForSeat(next)
		result[index] = next
	}
	return result
}

func publicRoomSettings(room *room) map[string]any {
	settings := room.Settings
	if settings == nil {
		settings = map[string]any{}
	}
	if room.Game == nil {
		return settings
	}
	if room.Tournament != nil {
		return mergeSettings(settings, map[string]any{
			"tournamentMode":            true,
			"initialParticipantCount":   room.Tournament.InitialParticipantCount,
			"humanParticipantCount":     room.Tournament.HumanParticipantCount,
			"computerParticipantCount":  room.Tournament.ComputerParticipantCount,
			"tournamentStartingBalance": room.Tournament.StartingBalance,
			"autoNextHand":              true,
			"endlessMode":               false,
		})
	}
	next := mergeSettings(settings, map[string]any{
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
	})
	return next
}

func publicRoomTimer(room *room) any {
	if room.Game == nil || room.Game.Timer == nil {
		return nil
	}
	return room.Game.Timer
}

func publicCardPeekPlayerIDs(room *room) []string {
	if room.Game == nil || room.Game.State == nil || boolValue(room.Game.State["finished"]) {
		return []string{}
	}
	active := map[string]bool{}
	for _, entry := range statePlayers(room.Game.State) {
		player := anyMap(entry)
		cards := anySlice(player["cards"])
		if !boolValue(player["eliminated"]) && !boolValue(player["folded"]) && len(cards) == 2 {
			active[playerID(player)] = true
		}
	}
	ids := []string{}
	for id := range room.Game.CardPeekPlayerIDs {
		if active[id] {
			ids = append(ids, id)
		}
	}
	return ids
}

func (h *roomHub) publicGameState(room *room, client *wsClient) any {
	if room.Game == nil || room.Game.State == nil {
		return nil
	}
	state := cloneMap(room.Game.State)
	showComputerStyles := room.Game.ShowComputerStyles
	playerIDForClient := ""
	if client != nil {
		playerIDForClient = client.playerID
	}

	showdownOpenIDs := map[string]bool{}
	for _, entry := range anySlice(state["showdownResults"]) {
		result := anyMap(entry)
		showdownOpenIDs[stringValue(result["id"])] = true
	}

	publicPlayers := []any{}
	for _, entry := range statePlayers(state) {
		player := cloneMap(anyMap(entry))
		revealCards := playerID(player) == playerIDForClient || showdownOpenIDs[playerID(player)]
		if !showComputerStyles && !boolValue(player["isHuman"]) {
			player["computerStyle"] = nil
			player["computerLevel"] = nil
		}
		if !revealCards {
			cards := anySlice(player["cards"])
			hidden := make([]any, len(cards))
			for index := range hidden {
				hidden[index] = nil
			}
			player["cards"] = hidden
		}
		publicPlayers = append(publicPlayers, player)
	}

	state["computerStyles"] = room.Game.ComputerStyles
	state["computerLevels"] = room.Game.ComputerLevels
	if !showComputerStyles {
		state["computerStyles"] = map[string]any{}
		state["computerLevels"] = map[string]any{}
	}
	state["deck"] = []any{}
	state["players"] = publicPlayers
	state["tableSeats"] = h.publicTableSeats(room, publicPlayers)
	return state
}

func (h *roomHub) publicTableSeats(room *room, publicPlayers []any) []any {
	activeByID := map[string]map[string]any{}
	for index, entry := range publicPlayers {
		player := cloneMap(anyMap(entry))
		player["stateIndex"] = index
		activeByID[playerID(player)] = player
	}

	order := room.Game.TableSeatOrder
	if len(order) == 0 {
		for _, entry := range publicPlayers {
			player := anyMap(entry)
			order = append(order, map[string]any{"playerId": playerID(player), "label": playerName(player)})
		}
	}

	result := make([]any, maxTotalPlayers)
	for index := 0; index < maxTotalPlayers; index++ {
		entry := map[string]any{}
		if index < len(order) {
			entry = order[index]
		}
		entryPlayerID := stringValue(entry["playerId"])
		if entryPlayerID == "" {
			result[index] = emptyTableSeat(index, stringValue(entry["label"]), entry)
			continue
		}
		if activePlayer, ok := activeByID[entryPlayerID]; ok {
			if humanSeat := room.seatByPlayerID(entryPlayerID); humanSeat != nil {
				activePlayer["isDisconnected"] = !humanSeat.Connected
				activePlayer["isPendingStandUp"] = humanSeat.PendingStandUp
				activePlayer["isPendingEndlessJoin"] = humanSeat.PendingEndless
				activePlayer["missedSmallBlind"] = humanSeat.MissedSmallBlind
				activePlayer["missedBigBlind"] = humanSeat.MissedBigBlind
				activePlayer["missedBlindAmount"] = missedBlindAmountForSeat(*humanSeat)
			}
			result[index] = activePlayer
			continue
		}
		if humanSeat := room.seatByPlayerID(entryPlayerID); humanSeat != nil {
			result[index] = publicInactiveHumanSeat(*humanSeat, index, anyMap(room.Game.ChipTotals[entryPlayerID]))
			continue
		}
		result[index] = emptyTableSeat(index, stringValue(entry["label"]), entry)
	}
	return result
}

func emptyTableSeat(index int, label string, entry map[string]any) map[string]any {
	if label == "" {
		label = "빈 자리"
	}
	setupPlayerID := stringValue(entry["setupPlayerId"])
	return map[string]any{
		"id":                  "empty-seat-" + strconvItoa(index+1),
		"setupPlayerId":       entry["setupPlayerId"],
		"playerId":            nil,
		"name":                label,
		"label":               label,
		"isEmptySeat":         true,
		"isJoinableHumanSeat": strings.HasPrefix(setupPlayerID, "human-slot-"),
		"stateIndex":          -1,
		"tableSeatIndex":      index,
	}
}

func publicInactiveHumanSeat(seat seat, index int, ledger map[string]any) map[string]any {
	chipBalance := ledger["chipBalance"]
	if chipBalance == nil {
		chipBalance = 0
	}
	chipsWon := ledger["chipsWon"]
	if chipsWon == nil {
		chipsWon = 0
	}
	return map[string]any{
		"id":                   seat.PlayerID,
		"name":                 seat.Name,
		"isHuman":              true,
		"isInactiveHumanSeat":  true,
		"isDisconnected":       !seat.Connected,
		"isAway":               seat.Away,
		"isPendingJoin":        seat.PendingJoin,
		"isPendingEndlessJoin": seat.PendingEndless,
		"isPendingStandUp":     seat.PendingStandUp,
		"missedSmallBlind":     seat.MissedSmallBlind,
		"missedBigBlind":       seat.MissedBigBlind,
		"missedBlindAmount":    missedBlindAmountForSeat(seat),
		"chipBalance":          chipBalance,
		"chipsWon":             chipsWon,
		"cards":                []any{},
		"stateIndex":           -1,
		"tableSeatIndex":       index,
	}
}

func (r *room) seatByPlayerID(playerID string) *seat {
	for index := range r.Seats {
		if r.Seats[index].PlayerID == playerID {
			return &r.Seats[index]
		}
	}
	return nil
}

func missedBlindAmountForSeat(seat seat) int {
	total := 0
	if seat.MissedSmallBlind {
		total += smallBlindAmount
	}
	if seat.MissedBigBlind {
		total += bigBlindAmount
	}
	return total
}
