package main

import (
	"fmt"
	"math"
	"strconv"
	"strings"
)

func anyMap(value any) map[string]any {
	if typed, ok := value.(map[string]any); ok {
		return typed
	}
	return map[string]any{}
}

func anySlice(value any) []any {
	if typed, ok := value.([]any); ok {
		return typed
	}
	return []any{}
}

func stringValueFromMap(source map[string]any, key string) string {
	return stringValue(source[key])
}

func boolValue(value any) bool {
	switch typed := value.(type) {
	case bool:
		return typed
	case string:
		return typed == "true"
	case float64:
		return typed != 0
	case int:
		return typed != 0
	default:
		return false
	}
}

func boolValueDefault(value any, fallback bool) bool {
	if value == nil {
		return fallback
	}
	switch value.(type) {
	case bool, string, float64, int:
		return boolValue(value)
	default:
		return fallback
	}
}

func intValue(value any) int {
	switch typed := value.(type) {
	case int:
		return typed
	case int64:
		return int(typed)
	case float64:
		if math.IsNaN(typed) || math.IsInf(typed, 0) {
			return 0
		}
		return int(typed)
	case jsonNumber:
		number, _ := strconv.Atoi(string(typed))
		return number
	case string:
		number, _ := strconv.Atoi(strings.TrimSpace(typed))
		return number
	default:
		return 0
	}
}

type jsonNumber string

func numberValue(value any) float64 {
	switch typed := value.(type) {
	case float64:
		return typed
	case int:
		return float64(typed)
	case int64:
		return float64(typed)
	case string:
		number, _ := strconv.ParseFloat(strings.TrimSpace(typed), 64)
		return number
	default:
		return 0
	}
}

func clampInt(value any, min int, max int, fallback int) int {
	numeric := intValue(value)
	if numeric == 0 {
		numeric = fallback
	}
	if numeric < min {
		return min
	}
	if numeric > max {
		return max
	}
	return numeric
}

func humanSlotID(index int) string {
	return fmt.Sprintf("human-slot-%d", index+1)
}

func computerPlayerID(index int) string {
	return fmt.Sprintf("cpu-%d", index+1)
}

func containsString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func keysFromSet(values map[string]bool) []string {
	result := make([]string, 0, len(values))
	for key, enabled := range values {
		if enabled {
			result = append(result, key)
		}
	}
	return result
}

func playerID(player map[string]any) string {
	return stringValue(player["id"])
}

func playerName(player map[string]any) string {
	return stringValue(player["name"])
}

func statePlayers(state map[string]any) []any {
	return anySlice(state["players"])
}

func playerAt(state map[string]any, index int) map[string]any {
	players := statePlayers(state)
	if index < 0 || index >= len(players) {
		return map[string]any{}
	}
	return anyMap(players[index])
}

func statePlayerIndexByID(state map[string]any, id string) int {
	for index, player := range statePlayers(state) {
		if playerID(anyMap(player)) == id {
			return index
		}
	}
	return -1
}

func activeStatePlayers(state map[string]any) []map[string]any {
	result := []map[string]any{}
	for _, entry := range statePlayers(state) {
		player := anyMap(entry)
		if !boolValue(player["folded"]) && !boolValue(player["eliminated"]) {
			result = append(result, player)
		}
	}
	return result
}

func cloneMap(source map[string]any) map[string]any {
	next := make(map[string]any, len(source))
	for key, value := range source {
		next[key] = value
	}
	return next
}
