package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"

	"github.com/dop251/goja"
)

type pokerEngine struct {
	mu      sync.Mutex
	runtime *goja.Runtime
	api     *goja.Object
}

func newPokerEngine(sourceDir string) (*pokerEngine, error) {
	runtime := goja.New()
	engine := &pokerEngine{runtime: runtime}

	if err := engine.load(sourceDir); err != nil {
		return nil, err
	}
	return engine, nil
}

func (e *pokerEngine) load(sourceDir string) error {
	if err := e.injectSeededRandom(os.Getenv("E2E_RANDOM_SEED")); err != nil {
		return err
	}

	rulesSource, err := os.ReadFile(filepath.Join(sourceDir, "domain", "game-rules.js"))
	if err != nil {
		return fmt.Errorf("read game rules: %w", err)
	}
	pokerSource, err := os.ReadFile(filepath.Join(sourceDir, "poker.js"))
	if err != nil {
		return fmt.Errorf("read poker engine: %w", err)
	}

	code := strings.Join([]string{
		`
function __formatLocaleNumber(value) {
  const numeric = Number(value ?? 0);
  const sign = numeric < 0 ? "-" : "";
  let text = String(Math.trunc(Math.abs(numeric)));
  let formatted = "";
  while (text.length > 3) {
    formatted = "," + text.slice(text.length - 3) + formatted;
    text = text.slice(0, text.length - 3);
  }
  return sign + text + formatted;
}
`,
		transformRulesSource(string(rulesSource)),
		transformPokerSource(string(pokerSource)),
		`
globalThis.__poker = {
  COMPUTER_LEVEL_OPTIONS,
  COMPUTER_STYLE_OPTIONS,
  applyAction,
  chooseComputerAction,
  computerCardPeekPlan,
  formatMoney,
  getAvailableActions,
  randomIndex,
  resolveComputerLevelKey,
  resolveComputerStyleKey,
  startNewHand
};
`,
	}, "\n")

	if _, err := e.runtime.RunString(code); err != nil {
		return fmt.Errorf("load poker engine: %w", err)
	}
	e.api = e.runtime.Get("__poker").ToObject(e.runtime)
	return nil
}

func (e *pokerEngine) injectSeededRandom(seed string) error {
	if strings.TrimSpace(seed) == "" {
		return nil
	}
	state := uint32(2166136261)
	seedText := seed
	if seedText == "" {
		seedText = "poker-e2e"
	}
	for _, char := range seedText {
		state ^= uint32(char)
		state *= 16777619
	}
	return e.runtime.Set("__POKER_TEST_RANDOM__", func() float64 {
		state += 0x6d2b79f5
		value := state
		value = (value ^ (value >> 15)) * (value | 1)
		value ^= value + ((value ^ (value >> 7)) * (value | 61))
		return float64(value^(value>>14)) / 4294967296
	})
}

func transformRulesSource(source string) string {
	return strings.ReplaceAll(source, "export const ", "const ")
}

func transformPokerSource(source string) string {
	lines := strings.Split(source, "\n")
	keptLines := make([]string, 0, len(lines))
	for _, line := range lines {
		if strings.HasPrefix(strings.TrimSpace(line), "import ") {
			continue
		}
		if strings.TrimSpace(line) == "export { MIN_PLAYABLE_BALANCE };" {
			continue
		}
		keptLines = append(keptLines, line)
	}

	transformed := strings.Join(keptLines, "\n")
	transformed = strings.ReplaceAll(transformed, "export function ", "function ")
	transformed = strings.ReplaceAll(transformed, "export const ", "const ")
	transformed = strings.ReplaceAll(transformed, "export { MIN_PLAYABLE_BALANCE };", "")
	transformed = strings.ReplaceAll(transformed, `Number(value ?? 0).toLocaleString("ko-KR")`, `__formatLocaleNumber(value ?? 0)`)
	exportDefaultRE := regexp.MustCompile(`export\s+default\s+`)
	return exportDefaultRE.ReplaceAllString(transformed, "")
}

func (e *pokerEngine) call(functionName string, args ...any) (any, error) {
	e.mu.Lock()
	defer e.mu.Unlock()

	value := e.api.Get(functionName)
	function, ok := goja.AssertFunction(value)
	if !ok {
		return nil, fmt.Errorf("poker function %s not found", functionName)
	}

	jsArgs := make([]goja.Value, 0, len(args))
	for _, arg := range args {
		value, err := e.jsonValue(arg)
		if err != nil {
			return nil, err
		}
		jsArgs = append(jsArgs, value)
	}

	result, err := function(goja.Undefined(), jsArgs...)
	if err != nil {
		return nil, err
	}
	return normalizeJSON(result.Export()), nil
}

func (e *pokerEngine) jsonValue(value any) (goja.Value, error) {
	if value == nil {
		return goja.Null(), nil
	}
	payload, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	return e.runtime.RunString("JSON.parse(" + strconv.Quote(string(payload)) + ")")
}

func (e *pokerEngine) startNewHand(payload map[string]any) (map[string]any, error) {
	result, err := e.call("startNewHand", payload)
	if err != nil {
		return nil, err
	}
	state, ok := result.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("startNewHand returned %T", result)
	}
	return state, nil
}

func (e *pokerEngine) applyAction(state map[string]any, action string, actorIndex int) (map[string]any, bool, error) {
	result, err := e.call("applyAction", state, action, actorIndex)
	if err != nil {
		return nil, false, err
	}
	nextState, ok := result.(map[string]any)
	if !ok {
		return nil, false, fmt.Errorf("applyAction returned %T", result)
	}
	same := jsonEqual(state, nextState)
	return nextState, !same, nil
}

func (e *pokerEngine) getAvailableActions(state map[string]any, actorIndex int) ([]map[string]any, error) {
	result, err := e.call("getAvailableActions", state, actorIndex)
	if err != nil {
		return nil, err
	}
	entries, _ := result.([]any)
	actions := make([]map[string]any, 0, len(entries))
	for _, entry := range entries {
		action, ok := entry.(map[string]any)
		if ok {
			actions = append(actions, action)
		}
	}
	return actions, nil
}

func (e *pokerEngine) chooseComputerAction(state map[string]any, actorIndex int) (string, error) {
	result, err := e.call("chooseComputerAction", state, actorIndex)
	if err != nil {
		return "", err
	}
	return stringValue(result), nil
}

func (e *pokerEngine) computerCardPeekPlan(state map[string]any, actorIndex int, actionDelayMs int) (map[string]any, error) {
	result, err := e.call("computerCardPeekPlan", state, actorIndex, actionDelayMs)
	if err != nil {
		return nil, err
	}
	plan, ok := result.(map[string]any)
	if !ok {
		return map[string]any{"shouldPeek": false, "durationMs": 0}, nil
	}
	return plan, nil
}

func (e *pokerEngine) resolveComputerStyleKey(value string) string {
	result, err := e.call("resolveComputerStyleKey", value)
	if err != nil {
		return "random"
	}
	return stringValue(result)
}

func (e *pokerEngine) resolveComputerLevelKey(value string) string {
	result, err := e.call("resolveComputerLevelKey", value)
	if err != nil {
		return "random"
	}
	return stringValue(result)
}

func stringValue(value any) string {
	switch typed := value.(type) {
	case string:
		return typed
	case fmt.Stringer:
		return typed.String()
	case nil:
		return ""
	default:
		return fmt.Sprint(typed)
	}
}

func jsonEqual(left any, right any) bool {
	leftBytes, leftErr := json.Marshal(left)
	rightBytes, rightErr := json.Marshal(right)
	return leftErr == nil && rightErr == nil && string(leftBytes) == string(rightBytes)
}

func normalizeJSON(value any) any {
	switch typed := value.(type) {
	case map[string]any:
		next := make(map[string]any, len(typed))
		for key, entry := range typed {
			next[key] = normalizeJSON(entry)
		}
		return next
	case []any:
		next := make([]any, len(typed))
		for index, entry := range typed {
			next[index] = normalizeJSON(entry)
		}
		return next
	case int64:
		return float64(typed)
	case int:
		return float64(typed)
	default:
		return typed
	}
}
