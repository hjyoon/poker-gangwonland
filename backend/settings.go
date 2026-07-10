package main

import (
	"crypto/rand"
	"fmt"
	"math"
	"strings"
)

func sanitizeComputerStyleKey(value string) string {
	switch strings.TrimSpace(value) {
	case "balanced", "cautious", "aggressive", "adaptive", "chaotic":
		return strings.TrimSpace(value)
	default:
		return "random"
	}
}

func sanitizeComputerLevelKey(value string) string {
	switch strings.TrimSpace(value) {
	case "beginner", "normal", "advanced":
		return strings.TrimSpace(value)
	default:
		return "random"
	}
}

func defaultComputerSettings(humanSlots int) []any {
	count := maxTotalPlayers - humanSlots
	if count > 3 {
		count = 3
	}
	if count < 0 {
		count = 0
	}
	result := make([]any, count)
	for index := 0; index < count; index++ {
		result[index] = map[string]any{
			"name":            "컴퓨터 " + strconvItoa(index+1),
			"startingBalance": defaultStartingBalance,
			"computerStyle":   "random",
			"computerLevel":   "random",
		}
	}
	return result
}

func strconvItoa(value int) string {
	return fmt.Sprintf("%d", value)
}

func normalizeHumanSettings(settings map[string]any, humanSlots int) []any {
	fallbackBalance := intValue(settings["humanStartingBalance"])
	if fallbackBalance <= 0 {
		fallbackBalance = defaultStartingBalance
	}
	source := anySlice(settings["humanPlayers"])
	if len(source) == 0 {
		source = make([]any, humanSlots)
	}
	result := make([]any, humanSlots)
	for index := 0; index < humanSlots; index++ {
		player := map[string]any{}
		if index < len(source) {
			player = anyMap(source[index])
		}
		startingBalance := intValue(player["startingBalance"])
		if startingBalance < 0 {
			startingBalance = 0
		}
		if _, ok := player["startingBalance"]; !ok {
			startingBalance = fallbackBalance
		}
		result[index] = map[string]any{
			"id":              humanSlotID(index),
			"name":            sanitizeName(stringValue(player["name"]), "빈 자리 "+strconvItoa(index+1)),
			"startingBalance": startingBalance,
		}
	}
	return result
}

func normalizePlayerOrder(orderValue any, humanSlots int, computerCount int) []string {
	validIDs := []string{}
	for index := 0; index < humanSlots; index++ {
		validIDs = append(validIDs, humanSlotID(index))
	}
	for index := 0; index < computerCount; index++ {
		validIDs = append(validIDs, computerPlayerID(index))
	}

	kept := []string{}
	for _, entry := range anySlice(orderValue) {
		id := stringValue(entry)
		if containsString(validIDs, id) && !containsString(kept, id) {
			kept = append(kept, id)
		}
	}
	for _, id := range validIDs {
		if !containsString(kept, id) {
			kept = append(kept, id)
		}
	}
	return kept
}

func shuffledPlayerOrder(humanSlots int, computerCount int) []string {
	order := normalizePlayerOrder(nil, humanSlots, computerCount)
	for index := len(order) - 1; index > 0; index-- {
		swapIndex := secureRandomIndex(index + 1)
		order[index], order[swapIndex] = order[swapIndex], order[index]
	}
	return order
}

func secureRandomIndex(length int) int {
	if length <= 1 {
		return 0
	}
	buffer := make([]byte, 1)
	if _, err := rand.Read(buffer); err != nil {
		return 0
	}
	return int(buffer[0]) % length
}

func humanSeatsFromPlayerOrder(playerOrder []string, humanSlots int, computerCount int) []any {
	placements := make([]any, humanSlots)
	for index := range placements {
		placements[index] = index
	}
	for index, id := range normalizePlayerOrder(stringsToAny(playerOrder), humanSlots, computerCount) {
		if strings.HasPrefix(id, "human-slot-") {
			slotIndex := intValue(strings.TrimPrefix(id, "human-slot-")) - 1
			if slotIndex >= 0 && slotIndex < humanSlots {
				placements[slotIndex] = index
			}
		}
	}
	return placements
}

func stringsToAny(values []string) []any {
	result := make([]any, len(values))
	for index, value := range values {
		result[index] = value
	}
	return result
}

func normalizeRoomSettingsFor(room *room, settings map[string]any) map[string]any {
	if settings == nil {
		settings = map[string]any{}
	}
	maxComputerPlayers := maxTotalPlayers - room.HumanSlots
	if maxComputerPlayers < 0 {
		maxComputerPlayers = 0
	}
	rawComputerPlayers, hasComputerPlayers := settings["computerPlayers"]
	sourceComputerPlayers := anySlice(rawComputerPlayers)
	if !hasComputerPlayers && len(sourceComputerPlayers) == 0 {
		sourceComputerPlayers = defaultComputerSettings(room.HumanSlots)
	}
	if len(sourceComputerPlayers) > maxComputerPlayers {
		sourceComputerPlayers = sourceComputerPlayers[:maxComputerPlayers]
	}

	computerPlayers := make([]any, len(sourceComputerPlayers))
	for index, entry := range sourceComputerPlayers {
		player := anyMap(entry)
		startingBalance := intValue(player["startingBalance"])
		if startingBalance <= 0 {
			startingBalance = defaultStartingBalance
		}
		computerPlayers[index] = map[string]any{
			"name":            sanitizeName(stringValue(player["name"]), "컴퓨터 "+strconvItoa(index+1)),
			"startingBalance": startingBalance,
			"computerStyle":   sanitizeComputerStyleKey(stringValue(player["computerStyle"])),
			"computerLevel":   sanitizeComputerLevelKey(stringValue(player["computerLevel"])),
		}
	}

	humanPlayers := normalizeHumanSettings(settings, room.HumanSlots)
	playerOrder := normalizePlayerOrder(settings["playerOrder"], room.HumanSlots, len(computerPlayers))
	randomizePlayerOrder := boolValue(settings["randomizePlayerOrder"]) || boolValue(settings["randomizeHumanSeats"])
	replacementBalance := intValue(settings["endlessReplacementStartingBalance"])
	if replacementBalance < minPlayableBalance {
		replacementBalance = defaultStartingBalance
	}

	return map[string]any{
		"humanStartingBalance":              anyMap(humanPlayers[0])["startingBalance"],
		"humanPlayers":                      humanPlayers,
		"humanSeatPlacements":               humanSeatsFromPlayerOrder(playerOrder, room.HumanSlots, len(computerPlayers)),
		"playerOrder":                       stringsToAny(playerOrder),
		"randomizePlayerOrder":              randomizePlayerOrder,
		"randomizeHumanSeats":               randomizePlayerOrder,
		"computerPlayers":                   computerPlayers,
		"autoNextHand":                      boolValue(settings["autoNextHand"]),
		"endlessMode":                       boolValue(settings["endlessMode"]),
		"endlessReplacementComputerStyle":   sanitizeComputerStyleKey(stringValue(settings["endlessReplacementComputerStyle"])),
		"endlessReplacementComputerLevel":   sanitizeComputerLevelKey(stringValue(settings["endlessReplacementComputerLevel"])),
		"endlessReplacementStartingBalance": replacementBalance,
		"showComputerStyles":                boolValueDefault(settings["showComputerStyles"], true),
		"showCumulativeWins":                boolValueDefault(settings["showCumulativeWins"], true),
		"computerActionDelayMs":             clampInt(settings["computerActionDelayMs"], minComputerActionDelayMs, maxComputerActionDelayMs, defaultComputerActionDelayMs),
		"nextHandDelayMs":                   clampInt(settings["nextHandDelayMs"], minNextHandDelayMs, maxNextHandDelayMs, defaultNextHandDelayMs),
		"humanActionTimeoutMs":              clampInt(settings["humanActionTimeoutMs"], minHumanActionTimeoutMs, maxHumanActionTimeoutMs, defaultHumanActionTimeoutMs),
	}
}

func mergeSettings(base map[string]any, overlay map[string]any) map[string]any {
	result := map[string]any{}
	for key, value := range base {
		result[key] = value
	}
	for key, value := range overlay {
		result[key] = value
	}
	return result
}

func intMin(values ...int) int {
	if len(values) == 0 {
		return 0
	}
	minValue := values[0]
	for _, value := range values[1:] {
		minValue = int(math.Min(float64(minValue), float64(value)))
	}
	return minValue
}
