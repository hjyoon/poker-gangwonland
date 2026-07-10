package main

func (h *roomHub) nextHandRequiredPlayerIDs(room *room) []string {
	if room == nil || room.Game == nil || room.Game.State == nil {
		return []string{}
	}
	if !boolValue(room.Game.State["finished"]) || boolValue(room.Game.State["gameOver"]) {
		return []string{}
	}
	connected := map[string]bool{}
	for _, seat := range room.Seats {
		if seat.PlayerID != "" && seat.Connected && !seatWillBeAwayNextHand(seat) && !seat.PendingStandUp {
			connected[seat.PlayerID] = true
		}
	}
	result := []string{}
	for _, entry := range statePlayers(room.Game.State) {
		player := anyMap(entry)
		id := playerID(player)
		if boolValue(player["isHuman"]) && !boolValue(player["eliminated"]) && connected[id] {
			result = append(result, id)
		}
	}
	return result
}

func (h *roomHub) nextHandReadyPlayerIDs(room *room) []string {
	if room == nil || room.Game == nil {
		return []string{}
	}
	required := map[string]bool{}
	for _, id := range h.nextHandRequiredPlayerIDs(room) {
		required[id] = true
	}
	result := []string{}
	for id := range room.Game.NextHandReadyPlayerIDs {
		if required[id] {
			result = append(result, id)
		}
	}
	return result
}

func (h *roomHub) allRequiredPlayersReady(room *room) bool {
	required := h.nextHandRequiredPlayerIDs(room)
	if len(required) == 0 {
		return true
	}
	for _, id := range required {
		if !room.Game.NextHandReadyPlayerIDs[id] {
			return false
		}
	}
	return true
}

func seatWillBeAwayNextHand(seat seat) bool {
	if seat.PendingReturn {
		return false
	}
	if seat.PendingAway {
		return true
	}
	return seat.Away
}

func seatWillParticipateNextHand(seat seat) bool {
	if seat.PlayerID == "" || seat.PendingStandUp || seat.PendingEndless {
		return false
	}
	return !seatWillBeAwayNextHand(seat)
}

func gameStateFinished(room *room) bool {
	return room != nil && room.Game != nil && room.Game.State != nil && boolValue(room.Game.State["finished"])
}

func gameStateOver(room *room) bool {
	return room != nil && room.Game != nil && room.Game.State != nil && boolValue(room.Game.State["gameOver"])
}

func mergeChipTotals(previous map[string]any, next any) map[string]any {
	result := map[string]any{}
	for key, value := range previous {
		result[key] = value
	}
	for key, value := range anyMap(next) {
		result[key] = value
	}
	return result
}
