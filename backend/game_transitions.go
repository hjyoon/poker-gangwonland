package main

import "sort"

type seatInfo struct {
	Seat            *seat
	SlotIndex       int
	PlayerName      string
	StartingBalance int
}

func playerChipBalance(room *room, state map[string]any, playerID string, fallback int) int {
	if room != nil && room.Game != nil {
		if ledger := anyMap(room.Game.ChipTotals[playerID]); len(ledger) > 0 {
			return intValue(ledger["chipBalance"])
		}
	}
	if state != nil {
		if ledger := anyMap(anyMap(state["chipTotals"])[playerID]); len(ledger) > 0 {
			return intValue(ledger["chipBalance"])
		}
		for _, entry := range statePlayers(state) {
			player := anyMap(entry)
			if playerID == stringValue(player["id"]) {
				return intValue(player["chipBalance"])
			}
		}
	}
	return fallback
}

func humanSlotIndexFromSetupPlayerID(setupPlayerID string) int {
	for index := 0; index < maxHumanSlots; index++ {
		if setupPlayerID == humanSlotID(index) {
			return index
		}
	}
	return -1
}

func sortPlayerConfigsByTableSeatOrder(room *room, configs []map[string]any) []map[string]any {
	orderByPlayerID := map[string]int{}
	if room != nil && room.Game != nil {
		for index, entry := range room.Game.TableSeatOrder {
			id := stringValue(entry["playerId"])
			if id != "" {
				if _, exists := orderByPlayerID[id]; !exists {
					orderByPlayerID[id] = index
				}
			}
		}
	}
	result := append([]map[string]any{}, configs...)
	sort.SliceStable(result, func(left int, right int) bool {
		leftID := stringValue(result[left]["id"])
		rightID := stringValue(result[right]["id"])
		leftOrder, hasLeft := orderByPlayerID[leftID]
		rightOrder, hasRight := orderByPlayerID[rightID]
		if !hasLeft {
			leftOrder = maxTotalPlayers + left
		}
		if !hasRight {
			rightOrder = maxTotalPlayers + right
		}
		return leftOrder < rightOrder
	})
	return result
}

func clearTableSeatOrderPlayerIDs(room *room, playerIDs map[string]bool) {
	if room == nil || room.Game == nil || len(playerIDs) == 0 {
		return
	}
	for index := range room.Game.TableSeatOrder {
		id := stringValue(room.Game.TableSeatOrder[index]["playerId"])
		if id != "" && playerIDs[id] {
			room.Game.TableSeatOrder[index]["playerId"] = nil
			room.Game.TableSeatOrder[index]["label"] = "빈 자리"
		}
	}
}

func seatIsEliminatedFromGame(room *room, state map[string]any, value seat) bool {
	if value.PlayerID == "" {
		return false
	}
	playerIndex := statePlayerIndexByID(state, value.PlayerID)
	if playerIndex >= 0 {
		player := playerAt(state, playerIndex)
		if boolValue(player["eliminated"]) {
			return true
		}
		if !boolValue(state["finished"]) {
			return false
		}
	}
	return playerChipBalance(room, state, value.PlayerID, 0) < minPlayableBalance
}

func (h *roomHub) applySeatParticipationReservationsLocked(room *room, state map[string]any) []any {
	logEntries := []any{}
	removedPlayerIDs := map[string]bool{}
	for index := range room.Seats {
		current := room.Seats[index]
		name := current.Name
		if name == "" {
			name = current.Label
		}
		if name == "" {
			name = defaultPlayerName
		}
		if current.PendingEndless && current.PlayerID != "" && statePlayerIndexByID(state, current.PlayerID) < 0 {
			continue
		}
		if seatIsEliminatedFromGame(room, state, current) {
			if current.PlayerID != "" {
				removedPlayerIDs[current.PlayerID] = true
			}
			logEntries = append(logEntries, name+": 탈락으로 게임에서 빠짐")
			room.Seats[index] = emptySeat(index)
			continue
		}
		if current.PendingStandUp {
			if current.PlayerID != "" {
				removedPlayerIDs[current.PlayerID] = true
			}
			logEntries = append(logEntries, name+": 딜러 차례가 되어 게임에서 빠짐")
			room.Seats[index] = emptySeat(index)
			continue
		}
		if current.PendingJoin {
			room.Seats[index].PendingJoin = false
			logEntries = append(logEntries, name+": 다음 핸드부터 참가")
		}
		if current.PendingAway {
			room.Seats[index].Away = true
			room.Seats[index].PendingAway = false
			room.Seats[index].PendingReturn = false
			room.Seats[index].PendingStandUp = false
			logEntries = append(logEntries, name+": 다음 핸드부터 자리 비움")
		}
		if current.PendingReturn {
			room.Seats[index].Away = false
			room.Seats[index].PendingAway = false
			room.Seats[index].PendingReturn = false
			room.Seats[index].PendingStandUp = false
			logEntries = append(logEntries, name+": 다음 핸드부터 복귀")
		}
	}
	clearTableSeatOrderPlayerIDs(room, removedPlayerIDs)
	for id := range removedPlayerIDs {
		delete(room.Game.NextHandReadyPlayerIDs, id)
		delete(room.Game.CardPeekPlayerIDs, id)
	}
	return logEntries
}

func endlessWaitingCandidates(room *room, state map[string]any) []waitingParticipant {
	activeIDs := map[string]bool{}
	for _, entry := range statePlayers(state) {
		player := anyMap(entry)
		if !boolValue(player["eliminated"]) {
			activeIDs[playerID(player)] = true
		}
	}
	candidates := []waitingParticipant{}
	seen := map[string]bool{}
	for _, participant := range room.WaitingParticipants {
		if participant.PlayerID == "" || !participant.Connected || !participant.PendingEndlessJoin || activeIDs[participant.PlayerID] || seen[participant.PlayerID] {
			continue
		}
		candidates = append(candidates, participant)
		seen[participant.PlayerID] = true
	}
	for _, value := range room.Seats {
		if value.PlayerID == "" || !value.Connected || !value.PendingEndless || activeIDs[value.PlayerID] || seen[value.PlayerID] {
			continue
		}
		candidates = append(candidates, waitingParticipant{
			PlayerID:           value.PlayerID,
			Name:               value.Name,
			Connected:          true,
			PendingEndlessJoin: true,
		})
		seen[value.PlayerID] = true
	}
	sort.SliceStable(candidates, func(left int, right int) bool {
		return candidates[left].CreatedAt < candidates[right].CreatedAt
	})
	return candidates
}

func replaceableEliminatedComputerPlayers(room *room, state map[string]any) []map[string]any {
	configuredComputerIDs := map[string]bool{}
	for _, config := range room.Game.AllPlayerConfigs {
		if !boolValue(config["isHuman"]) {
			configuredComputerIDs[stringValue(config["id"])] = true
		}
	}
	tableComputerIDs := map[string]bool{}
	for _, entry := range room.Game.TableSeatOrder {
		id := stringValue(entry["playerId"])
		if id != "" && configuredComputerIDs[id] {
			tableComputerIDs[id] = true
		}
	}
	result := []map[string]any{}
	for _, entry := range statePlayers(state) {
		player := anyMap(entry)
		id := playerID(player)
		if boolValue(player["isHuman"]) || !configuredComputerIDs[id] || !tableComputerIDs[id] {
			continue
		}
		if boolValue(player["eliminated"]) || playerChipBalance(room, state, id, intValue(player["chipBalance"])) < minPlayableBalance {
			result = append(result, player)
		}
	}
	return result
}

func (h *roomHub) ensureHumanSeatForEndlessParticipantLocked(room *room, participant waitingParticipant) *seatInfo {
	seatIndex := -1
	for index := range room.Seats {
		if room.Seats[index].PlayerID == participant.PlayerID {
			seatIndex = index
			break
		}
	}
	if seatIndex < 0 && len(room.Seats) < maxHumanSlots {
		seatIndex = len(room.Seats)
		room.Seats = append(room.Seats, emptySeat(seatIndex))
	}
	if seatIndex < 0 {
		for index := range room.Seats {
			if room.Seats[index].PlayerID == "" {
				seatIndex = index
				break
			}
		}
	}
	if seatIndex < 0 {
		return nil
	}

	room.HumanSlots = len(room.Seats)
	playerName := sanitizeName(participant.Name, defaultPlayerName)
	humanPlayers := normalizeHumanSettings(room.Settings, room.HumanSlots)
	startingBalance := defaultStartingBalance
	if seatIndex < len(humanPlayers) {
		startingBalance = intValue(anyMap(humanPlayers[seatIndex])["startingBalance"])
	}
	if startingBalance < minPlayableBalance {
		startingBalance = defaultStartingBalance
	}
	room.Seats[seatIndex] = seat{
		ID:             humanSlotID(seatIndex),
		Label:          "빈 자리 " + strconvItoa(seatIndex+1),
		PlayerID:       participant.PlayerID,
		Name:           playerName,
		Connected:      true,
		PendingEndless: false,
	}
	humanPlayers[seatIndex] = map[string]any{
		"id":              humanSlotID(seatIndex),
		"name":            playerName,
		"startingBalance": startingBalance,
	}
	room.Settings = normalizeRoomSettingsFor(room, mergeSettings(room.Settings, map[string]any{
		"humanPlayers":         humanPlayers,
		"humanStartingBalance": startingBalance,
	}))
	return &seatInfo{
		Seat:            &room.Seats[seatIndex],
		SlotIndex:       seatIndex,
		PlayerName:      playerName,
		StartingBalance: startingBalance,
	}
}

func replaceConfig(configs []map[string]any, oldID string, removeID string, next map[string]any) []map[string]any {
	result := []map[string]any{}
	replaced := false
	for _, config := range configs {
		id := stringValue(config["id"])
		if id == removeID {
			continue
		}
		if id == oldID {
			result = append(result, next)
			replaced = true
			continue
		}
		result = append(result, config)
	}
	if !replaced {
		result = append(result, next)
	}
	return result
}

func (h *roomHub) applyEndlessHumanJoinReservationsLocked(room *room, state map[string]any) []any {
	if room.Game == nil || !room.Game.EndlessMode || state == nil {
		return []any{}
	}
	candidates := endlessWaitingCandidates(room, state)
	computers := replaceableEliminatedComputerPlayers(room, state)
	if len(candidates) == 0 || len(computers) == 0 {
		return []any{}
	}
	logEntries := []any{}
	nextAll := append([]map[string]any{}, room.Game.AllPlayerConfigs...)
	nextActive := append([]map[string]any{}, room.Game.PlayerConfigs...)
	limit := len(candidates)
	if len(computers) < limit {
		limit = len(computers)
	}
	for index := 0; index < limit; index++ {
		candidate := candidates[index]
		computer := computers[index]
		seatInfo := h.ensureHumanSeatForEndlessParticipantLocked(room, candidate)
		if seatInfo == nil {
			continue
		}
		humanConfig := map[string]any{
			"id":              candidate.PlayerID,
			"name":            seatInfo.PlayerName,
			"isHuman":         true,
			"startingBalance": seatInfo.StartingBalance,
		}
		setupID := humanSlotID(seatInfo.SlotIndex)
		computerID := playerID(computer)
		for orderIndex := range room.Game.TableSeatOrder {
			entry := room.Game.TableSeatOrder[orderIndex]
			if stringValue(entry["playerId"]) == computerID {
				entry["setupPlayerId"] = setupID
				entry["playerId"] = candidate.PlayerID
				entry["label"] = seatInfo.PlayerName
			} else if stringValue(entry["setupPlayerId"]) == setupID && stringValue(entry["playerId"]) == "" {
				entry["setupPlayerId"] = nil
				entry["label"] = "빈 자리"
			}
		}
		nextAll = replaceConfig(nextAll, computerID, candidate.PlayerID, humanConfig)
		nextActive = replaceConfig(nextActive, computerID, candidate.PlayerID, humanConfig)
		room.Game.ChipTotals[candidate.PlayerID] = map[string]any{"chipBalance": seatInfo.StartingBalance, "chipsWon": 0}
		delete(room.Game.ComputerStyles, computerID)
		delete(room.Game.ComputerLevels, computerID)
		delete(room.Game.ComputerStyles, candidate.PlayerID)
		delete(room.Game.ComputerLevels, candidate.PlayerID)
		room.WaitingParticipants = filterWaitingParticipants(room.WaitingParticipants, candidate.PlayerID)
		delete(room.Game.NextHandReadyPlayerIDs, candidate.PlayerID)
		delete(room.Game.CardPeekPlayerIDs, candidate.PlayerID)
		logEntries = append(logEntries, seatInfo.PlayerName+": 엔들리스 참가 대기로 "+playerName(computer)+"의 좌석에 참가")
	}
	room.Game.AllPlayerConfigs = sortPlayerConfigsByTableSeatOrder(room, nextAll)
	room.Game.PlayerConfigs = sortPlayerConfigsByTableSeatOrder(room, nextActive)
	room.Game.CPUCount = 0
	for _, config := range room.Game.AllPlayerConfigs {
		if !boolValue(config["isHuman"]) {
			room.Game.CPUCount++
		}
	}
	return logEntries
}

func nextConfigAfter(configs []map[string]any, startIndex int, eligible map[string]bool) map[string]any {
	if len(configs) == 0 || len(eligible) == 0 {
		return nil
	}
	for offset := 1; offset <= len(configs); offset++ {
		config := configs[(startIndex+offset+len(configs))%len(configs)]
		if eligible[stringValue(config["id"])] {
			return config
		}
	}
	return nil
}

func eligibleConfigsForBlindRotation(room *room, state map[string]any) []map[string]any {
	configs := room.Game.AllPlayerConfigs
	if len(configs) == 0 {
		configs = room.Game.PlayerConfigs
	}
	result := []map[string]any{}
	for _, config := range configs {
		id := stringValue(config["id"])
		if playerChipBalance(room, state, id, intValue(config["startingBalance"])) < minPlayableBalance {
			continue
		}
		if boolValue(config["isHuman"]) && room.seatByPlayerID(id) == nil {
			continue
		}
		result = append(result, config)
	}
	return result
}

func nextFullBlindRoleIDs(room *room, state map[string]any) (string, string, string) {
	configs := room.Game.AllPlayerConfigs
	if len(configs) == 0 {
		configs = room.Game.PlayerConfigs
	}
	eligibleConfigs := eligibleConfigsForBlindRotation(room, state)
	if len(eligibleConfigs) < 2 {
		return "", "", ""
	}
	eligible := map[string]bool{}
	for _, config := range eligibleConfigs {
		eligible[stringValue(config["id"])] = true
	}
	previousDealerID := playerID(playerAt(state, intValue(state["dealerIndex"])))
	startIndex := -1
	for index, config := range configs {
		if stringValue(config["id"]) == previousDealerID {
			startIndex = index
			break
		}
	}
	dealer := nextConfigAfter(configs, startIndex, eligible)
	dealerIndex := -1
	for index, config := range configs {
		if stringValue(config["id"]) == stringValue(dealer["id"]) {
			dealerIndex = index
			break
		}
	}
	small := nextConfigAfter(configs, dealerIndex, eligible)
	smallIndex := -1
	for index, config := range configs {
		if stringValue(config["id"]) == stringValue(small["id"]) {
			smallIndex = index
			break
		}
	}
	big := nextConfigAfter(configs, smallIndex, eligible)
	return stringValue(dealer["id"]), stringValue(small["id"]), stringValue(big["id"])
}

func (h *roomHub) nextDealerIndexForPlayerConfigsLocked(room *room, state map[string]any, nextPlayerConfigs []map[string]any) int {
	if len(nextPlayerConfigs) == 0 {
		return 0
	}
	configs := room.Game.AllPlayerConfigs
	if len(configs) == 0 {
		configs = room.Game.PlayerConfigs
	}
	active := map[string]bool{}
	for _, config := range nextPlayerConfigs {
		active[stringValue(config["id"])] = true
	}
	previousDealerID := playerID(playerAt(state, intValue(state["dealerIndex"])))
	startIndex := -1
	for index, config := range configs {
		if stringValue(config["id"]) == previousDealerID {
			startIndex = index
			break
		}
	}
	nextDealer := nextConfigAfter(configs, startIndex, active)
	for index, config := range nextPlayerConfigs {
		if stringValue(config["id"]) == stringValue(nextDealer["id"]) {
			return index
		}
	}
	return 0
}

func (h *roomHub) recordMissedBlindsForAwaySeatsLocked(room *room, state map[string]any) []any {
	_, smallBlindID, bigBlindID := nextFullBlindRoleIDs(room, state)
	logEntries := []any{}
	for index := range room.Seats {
		current := room.Seats[index]
		if current.PlayerID == "" || !seatWillBeAwayNextHand(current) {
			continue
		}
		name := current.Name
		if name == "" {
			name = defaultPlayerName
		}
		if current.PlayerID == smallBlindID && !current.MissedSmallBlind {
			room.Seats[index].MissedSmallBlind = true
			logEntries = append(logEntries, name+": 자리 비움으로 스몰 블라인드 미스드 기록")
		}
		if current.PlayerID == bigBlindID && !current.MissedBigBlind {
			room.Seats[index].MissedBigBlind = true
			logEntries = append(logEntries, name+": 자리 비움으로 빅 블라인드 미스드 기록")
		}
	}
	return logEntries
}

func missedBlindLabelForSeat(value seat) string {
	if value.MissedSmallBlind && value.MissedBigBlind {
		return "스몰+빅"
	}
	if value.MissedSmallBlind {
		return "스몰"
	}
	if value.MissedBigBlind {
		return "빅"
	}
	return ""
}

func (h *roomHub) missedBlindForcedContributionsLocked(room *room, nextPlayerConfigs []map[string]any) []any {
	active := map[string]bool{}
	for _, config := range nextPlayerConfigs {
		active[stringValue(config["id"])] = true
	}
	contributions := []any{}
	for index := range room.Seats {
		current := room.Seats[index]
		amount := missedBlindAmountForSeat(current)
		if current.PlayerID == "" || amount <= 0 || !active[current.PlayerID] {
			continue
		}
		contributions = append(contributions, map[string]any{
			"playerId": current.PlayerID,
			"amount":   amount,
			"label":    "미스드 블라인드(" + missedBlindLabelForSeat(current) + ")",
		})
		room.Seats[index].MissedSmallBlind = false
		room.Seats[index].MissedBigBlind = false
	}
	return contributions
}

func syncAllPlayerConfigsLocked(room *room, activeBefore []map[string]any, activeAfter []map[string]any) {
	all := room.Game.AllPlayerConfigs
	if len(all) == 0 {
		all = room.Game.PlayerConfigs
	}
	replacements := map[string]map[string]any{}
	for index, config := range activeBefore {
		if index < len(activeAfter) {
			replacements[stringValue(config["id"])] = activeAfter[index]
		}
	}
	for index, config := range all {
		if next, ok := replacements[stringValue(config["id"])]; ok {
			all[index] = next
		}
	}
	room.Game.AllPlayerConfigs = all
}

func syncTableSeatOrderLocked(room *room, activeBefore []map[string]any, activeAfter []map[string]any) {
	replacements := map[string]string{}
	for index, config := range activeBefore {
		if index < len(activeAfter) {
			nextID := stringValue(activeAfter[index]["id"])
			if nextID != "" {
				replacements[stringValue(config["id"])] = nextID
			}
		}
	}
	for index := range room.Game.TableSeatOrder {
		id := stringValue(room.Game.TableSeatOrder[index]["playerId"])
		if nextID, ok := replacements[id]; ok {
			room.Game.TableSeatOrder[index]["playerId"] = nextID
		}
	}
}
