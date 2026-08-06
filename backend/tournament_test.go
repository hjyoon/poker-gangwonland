package main

import (
	"encoding/json"
	"reflect"
	"sort"
	"testing"
)

func TestBalancedTableSizes(t *testing.T) {
	tests := []struct {
		participants int
		want         []int
	}{
		{participants: 0, want: []int{}},
		{participants: 2, want: []int{2}},
		{participants: 8, want: []int{8}},
		{participants: 9, want: []int{5, 4}},
		{participants: 16, want: []int{8, 8}},
		{participants: 17, want: []int{6, 6, 5}},
		{participants: 64, want: []int{8, 8, 8, 8, 8, 8, 8, 8}},
		{participants: 128, want: []int{8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8}},
	}

	for _, test := range tests {
		t.Run(strconvItoa(test.participants), func(t *testing.T) {
			got := balancedTableSizes(test.participants)
			if !reflect.DeepEqual(got, test.want) {
				t.Fatalf("balancedTableSizes(%d) = %v, want %v", test.participants, got, test.want)
			}
			for _, size := range got {
				if size > maxTotalPlayers {
					t.Fatalf("table size %d exceeds the maximum of %d", size, maxTotalPlayers)
				}
			}
		})
	}
}

func TestAllocateTournamentGroupsKeepsTablesBalancedAndParticipantsUnique(t *testing.T) {
	participants := make([]*tournamentParticipant, 0, 15)
	for index := 0; index < 15; index++ {
		tableNumber := 1
		if index >= 7 {
			tableNumber = 2
		}
		participants = append(participants, &tournamentParticipant{
			ID:          "player-" + strconvItoa(index+1),
			EntryIndex:  index,
			TableNumber: tableNumber,
		})
	}

	groups := allocateTournamentGroups(participants)
	if got, want := []int{len(groups[0]), len(groups[1])}, []int{8, 7}; !reflect.DeepEqual(got, want) {
		t.Fatalf("group sizes = %v, want %v", got, want)
	}

	seen := map[string]bool{}
	for _, group := range groups {
		if len(group) > maxTotalPlayers {
			t.Fatalf("group has %d participants, maximum is %d", len(group), maxTotalPlayers)
		}
		for _, participant := range group {
			if seen[participant.ID] {
				t.Fatalf("participant %q was allocated more than once", participant.ID)
			}
			seen[participant.ID] = true
		}
	}
	if len(seen) != len(participants) {
		t.Fatalf("allocated %d unique participants, want %d", len(seen), len(participants))
	}
	if groups[0][7].ID != "player-15" {
		t.Fatalf("expected the first overflow participant to rebalance into table 1, got %q", groups[0][7].ID)
	}
}

func TestNormalizeTournamentSettingsCountsHumansAndComputersTogether(t *testing.T) {
	settings := normalizeTournamentSettings(map[string]any{
		"initialParticipantCount":   12,
		"humanParticipantCount":     3,
		"tournamentStartingBalance": 150_000,
		"endlessMode":               true,
	}, nil)

	if got := intValue(settings["initialParticipantCount"]); got != 12 {
		t.Fatalf("initial participant count = %d, want 12", got)
	}
	if got := intValue(settings["humanParticipantCount"]); got != 3 {
		t.Fatalf("human participant count = %d, want 3", got)
	}
	if got := intValue(settings["computerParticipantCount"]); got != 9 {
		t.Fatalf("computer participant count = %d, want 9", got)
	}
	if boolValue(settings["endlessMode"]) {
		t.Fatal("tournament settings must always disable endless replacements")
	}
	singlePlayerSettings := normalizeTournamentSettings(map[string]any{
		"singlePlayerTournament":  true,
		"initialParticipantCount": 12,
		"humanParticipantCount":   3,
	}, nil)
	if !boolValue(singlePlayerSettings["singlePlayerTournament"]) {
		t.Fatal("single-player tournament setting was not preserved")
	}
	if got := intValue(singlePlayerSettings["humanParticipantCount"]); got != 1 {
		t.Fatalf("single-player tournament human count = %d, want 1", got)
	}
	if got := intValue(singlePlayerSettings["computerParticipantCount"]); got != 11 {
		t.Fatalf("single-player tournament computer count = %d, want 11", got)
	}
	maximumSettings := normalizeTournamentSettings(map[string]any{
		"initialParticipantCount": 999,
		"humanParticipantCount":   1,
	}, nil)
	if got := intValue(maximumSettings["initialParticipantCount"]); got != 128 {
		t.Fatalf("maximum tournament participant count = %d, want 128", got)
	}
}

func TestStartTournamentBuildsBalancedTables(t *testing.T) {
	engine, err := newPokerEngine("../lib")
	if err != nil {
		t.Fatalf("load poker engine: %v", err)
	}
	settings := normalizeTournamentSettings(map[string]any{
		"initialParticipantCount":   9,
		"humanParticipantCount":     1,
		"tournamentStartingBalance": 100_000,
		"computerStyle":             "balanced",
		"computerLevel":             "intermediate",
	}, nil)
	value := newTournament("ABC123", "human-1", settings)
	lobby := &room{
		ID:           value.ID,
		HumanSlots:   1,
		HostPlayerID: value.HostPlayerID,
		Seats: []seat{{
			ID:        humanSlotID(0),
			Label:     "Host",
			PlayerID:  "human-1",
			Name:      "Host",
			Connected: true,
		}},
		Settings:   settings,
		clients:    map[*wsClient]struct{}{},
		Tournament: value,
	}
	hub := &roomHub{
		rooms:       map[string]*room{value.ID: lobby},
		tournaments: map[string]*tournament{value.ID: value},
		engine:      engine,
	}

	roomIDs, err := hub.startTournamentLocked(lobby, settings)
	if err != nil {
		t.Fatalf("start tournament: %v", err)
	}
	if got, want := roomIDs, []string{"ABC123", "ABC123-T2"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("room IDs = %v, want %v", got, want)
	}
	if value.Status != tournamentStatusRunning {
		t.Fatalf("tournament status = %q, want %q", value.Status, tournamentStatusRunning)
	}
	if len(value.Participants) != 9 {
		t.Fatalf("participant count = %d, want 9", len(value.Participants))
	}

	tableSizes := make([]int, 0, len(roomIDs))
	playerIDs := []string{}
	for _, roomID := range roomIDs {
		tableRoom := hub.rooms[roomID]
		if tableRoom == nil || tableRoom.Game == nil {
			t.Fatalf("table room %q was not built", roomID)
		}
		if tableRoom.Game.EndlessMode {
			t.Fatalf("table room %q enabled endless replacements", roomID)
		}
		tableSizes = append(tableSizes, len(tableRoom.Game.PlayerConfigs))
		for _, config := range tableRoom.Game.PlayerConfigs {
			playerIDs = append(playerIDs, stringValue(config["id"]))
		}
	}
	sort.Ints(tableSizes)
	if want := []int{4, 5}; !reflect.DeepEqual(tableSizes, want) {
		t.Fatalf("table sizes = %v, want %v", tableSizes, want)
	}
	sort.Strings(playerIDs)
	for index := 1; index < len(playerIDs); index++ {
		if playerIDs[index] == playerIDs[index-1] {
			t.Fatalf("participant %q appears at more than one table", playerIDs[index])
		}
	}
}

func TestMaximumTournamentBuildsSixteenTablesWithinFrameLimit(t *testing.T) {
	engine, err := newPokerEngine("../lib")
	if err != nil {
		t.Fatalf("load poker engine: %v", err)
	}
	settings := normalizeTournamentSettings(map[string]any{
		"singlePlayerTournament":    true,
		"initialParticipantCount":   128,
		"humanParticipantCount":     1,
		"tournamentStartingBalance": 1_000_000,
	}, nil)
	value := newTournament("ABC123", "human-1", settings)
	client := &wsClient{roomID: value.ID, playerID: "human-1"}
	lobby := &room{
		ID:           value.ID,
		HumanSlots:   1,
		HostPlayerID: value.HostPlayerID,
		Seats: []seat{{
			ID:        humanSlotID(0),
			PlayerID:  client.playerID,
			Name:      "Player",
			Connected: true,
		}},
		Settings:   settings,
		clients:    map[*wsClient]struct{}{client: {}},
		Tournament: value,
	}
	hub := &roomHub{
		rooms:       map[string]*room{value.ID: lobby},
		tournaments: map[string]*tournament{value.ID: value},
		engine:      engine,
	}
	roomIDs, err := hub.startTournamentLocked(lobby, settings)
	if err != nil {
		t.Fatalf("start maximum tournament: %v", err)
	}
	if got := len(roomIDs); got != 16 {
		t.Fatalf("maximum tournament table count = %d, want 16", got)
	}
	if got := len(value.Participants); got != 128 {
		t.Fatalf("maximum tournament participant count = %d, want 128", got)
	}
	homeRoom := hub.rooms[client.roomID]
	body, err := json.Marshal(map[string]any{"type": "roomState", "room": hub.publicRoom(homeRoom, homeRoom, client)})
	if err != nil {
		t.Fatalf("marshal maximum tournament room state: %v", err)
	}
	if len(body) > 65_535 {
		t.Fatalf("maximum tournament room state is %d bytes, exceeds WebSocket frame limit", len(body))
	}
}

func TestTournamentWaitsForEveryTableThenRebalancesBetweenHands(t *testing.T) {
	engine, err := newPokerEngine("../lib")
	if err != nil {
		t.Fatalf("load poker engine: %v", err)
	}
	settings := normalizeTournamentSettings(map[string]any{
		"initialParticipantCount":   9,
		"humanParticipantCount":     1,
		"tournamentStartingBalance": 100_000,
		"computerActionDelayMs":     maxComputerActionDelayMs,
		"nextHandDelayMs":           minNextHandDelayMs,
	}, nil)
	value := newTournament("ABC123", "human-1", settings)
	lobby := &room{
		ID:           value.ID,
		HumanSlots:   1,
		HostPlayerID: value.HostPlayerID,
		Seats: []seat{{
			ID:        humanSlotID(0),
			PlayerID:  "human-1",
			Name:      "Host",
			Connected: true,
		}},
		Settings:   settings,
		clients:    map[*wsClient]struct{}{},
		Tournament: value,
	}
	hub := &roomHub{
		rooms:       map[string]*room{value.ID: lobby},
		tournaments: map[string]*tournament{value.ID: value},
		engine:      engine,
	}
	roomIDs, err := hub.startTournamentLocked(lobby, settings)
	if err != nil {
		t.Fatalf("start tournament: %v", err)
	}
	if len(roomIDs) != 2 {
		t.Fatalf("table count = %d, want 2", len(roomIDs))
	}

	firstTable := hub.rooms[roomIDs[0]]
	secondTable := hub.rooms[roomIDs[1]]
	firstTable.Game.State["finished"] = true
	hub.scheduleTournamentAdvance(value.ID)
	if value.AdvanceTimer != nil {
		value.AdvanceTimer.Stop()
		t.Fatal("tournament scheduled the next round before every table finished")
	}

	eliminatedID := ""
	for _, config := range secondTable.Game.PlayerConfigs {
		if !boolValue(config["isHuman"]) {
			eliminatedID = stringValue(config["id"])
			break
		}
	}
	if eliminatedID == "" {
		t.Fatal("second table did not contain a computer participant to eliminate")
	}
	secondTable.Game.State["finished"] = true
	for _, entry := range statePlayers(secondTable.Game.State) {
		player := anyMap(entry)
		if playerID(player) != eliminatedID {
			continue
		}
		player["chipBalance"] = 0
		player["eliminated"] = true
		player["folded"] = true
	}
	secondTable.Game.ChipTotals[eliminatedID] = map[string]any{"chipBalance": 0, "chipsWon": 0}

	hub.scheduleTournamentAdvance(value.ID)
	if value.AdvanceTimer == nil {
		t.Fatal("tournament did not schedule the next round after every table finished")
	}
	value.AdvanceTimer.Stop()
	value.AdvanceTimer = nil
	value.AdvanceScheduledAt = 0
	hub.advanceTournamentRound(value.ID)

	if value.Round != 2 {
		t.Fatalf("tournament round = %d, want 2", value.Round)
	}
	if len(value.TableRoomIDs) != 1 {
		t.Fatalf("table count after reaching eight survivors = %d, want 1", len(value.TableRoomIDs))
	}
	if !value.Participants[eliminatedID].Eliminated || value.Participants[eliminatedID].Placement != 9 {
		t.Fatalf("eliminated participant state = %+v, want eliminated in ninth place", value.Participants[eliminatedID])
	}
	finalTable := hub.rooms[value.TableRoomIDs[0]]
	if got := len(finalTable.Game.PlayerConfigs); got != 8 {
		t.Fatalf("rebalanced table participant count = %d, want 8", got)
	}
	if finalTable.AutomationTimer != nil {
		finalTable.AutomationTimer.Stop()
		finalTable.AutomationTimer = nil
	}
	if finalTable.ComputerPeekTimer != nil {
		finalTable.ComputerPeekTimer.Stop()
		finalTable.ComputerPeekTimer = nil
	}
}

func TestDisconnectKeepsRunningTournamentSeat(t *testing.T) {
	participant := &tournamentParticipant{ID: "human-1", Name: "Host", IsHuman: true, Connected: true}
	value := &tournament{
		ID:           "ABC123",
		Status:       tournamentStatusRunning,
		Participants: map[string]*tournamentParticipant{participant.ID: participant},
	}
	client := &wsClient{roomID: value.ID, playerID: participant.ID}
	tableRoom := &room{
		ID:         value.ID,
		Tournament: value,
		Seats: []seat{{
			ID:        humanSlotID(0),
			PlayerID:  participant.ID,
			Name:      participant.Name,
			Connected: true,
		}},
		clients: map[*wsClient]struct{}{client: {}},
	}
	hub := &roomHub{rooms: map[string]*room{value.ID: tableRoom}}

	hub.detachLocked(client, true)

	if tableRoom.Seats[0].PlayerID != participant.ID {
		t.Fatal("disconnect cleared the tournament seat")
	}
	if tableRoom.Seats[0].Connected || participant.Connected {
		t.Fatal("disconnect did not mark the participant as disconnected")
	}
	if tableRoom.CleanupTimer != nil {
		t.Fatal("a running tournament table must not be cleaned up when all clients disconnect")
	}
}

func TestDisconnectedTournamentHumanPaysBlindAndFoldsWithoutClients(t *testing.T) {
	engine, err := newPokerEngine("../lib")
	if err != nil {
		t.Fatalf("load poker engine: %v", err)
	}
	settings := normalizeTournamentSettings(map[string]any{
		"initialParticipantCount":   2,
		"humanParticipantCount":     1,
		"tournamentStartingBalance": 100_000,
	}, nil)
	value := newTournament("ABC123", "human-1", settings)
	value.Status = tournamentStatusRunning
	value.Round = 1
	computer := &tournamentParticipant{
		ID:              "cpu-1",
		Name:            "Computer",
		EntryIndex:      0,
		StartingBalance: 100_000,
		ChipBalance:     100_000,
		Connected:       true,
		TableNumber:     1,
		TableRoomID:     value.ID,
	}
	human := &tournamentParticipant{
		ID:              "human-1",
		Name:            "Host",
		IsHuman:         true,
		EntryIndex:      1,
		StartingBalance: 100_000,
		ChipBalance:     100_000,
		Connected:       false,
		TableNumber:     1,
		TableRoomID:     value.ID,
	}
	value.Participants = map[string]*tournamentParticipant{computer.ID: computer, human.ID: human}
	value.EntryOrder = []string{computer.ID, human.ID}
	value.TableRoomIDs = []string{value.ID}
	tableRoom := &room{
		ID:           value.ID,
		HostPlayerID: human.ID,
		Settings:     settings,
		Tournament:   value,
		TableNumber:  1,
		Seats: []seat{{
			ID:        humanSlotID(0),
			PlayerID:  human.ID,
			Name:      human.Name,
			Connected: false,
		}},
		clients: map[*wsClient]struct{}{},
	}
	hub := &roomHub{
		rooms:       map[string]*room{value.ID: tableRoom},
		tournaments: map[string]*tournament{value.ID: value},
		engine:      engine,
	}
	tableRoom.Game, err = hub.buildTournamentGameLocked(tableRoom, []*tournamentParticipant{computer, human}, 1, computer.ID)
	if err != nil {
		t.Fatalf("build tournament game: %v", err)
	}
	if got := playerID(playerAt(tableRoom.Game.State, intValue(tableRoom.Game.State["currentPlayerIndex"]))); got != human.ID {
		t.Fatalf("current actor = %q, want disconnected human %q", got, human.ID)
	}

	hub.scheduleRoomAutomation(tableRoom.ID)

	if !boolValue(tableRoom.Game.State["finished"]) {
		t.Fatal("the hand did not finish after the disconnected human automatically folded")
	}
	humanState := playerAt(tableRoom.Game.State, statePlayerIndexByID(tableRoom.Game.State, human.ID))
	if !boolValue(humanState["folded"]) {
		t.Fatal("the disconnected human was not folded")
	}
	if got := intValue(humanState["chipBalance"]); got != 98_000 {
		t.Fatalf("disconnected human chip balance = %d, want 98000 after posting the small blind", got)
	}
	if value.AdvanceTimer != nil {
		value.AdvanceTimer.Stop()
		value.AdvanceTimer = nil
	}
}

func TestConnectedSinglePlayerTournamentHumanHasNoActionTimer(t *testing.T) {
	engine, err := newPokerEngine("../lib")
	if err != nil {
		t.Fatalf("load poker engine: %v", err)
	}
	settings := normalizeTournamentSettings(map[string]any{
		"singlePlayerTournament":    true,
		"initialParticipantCount":   2,
		"humanParticipantCount":     1,
		"tournamentStartingBalance": 100_000,
	}, nil)
	value := newTournament("ABC123", "human-1", settings)
	value.Status = tournamentStatusRunning
	value.Round = 1
	computer := &tournamentParticipant{
		ID:              "cpu-1",
		Name:            "Computer",
		EntryIndex:      0,
		StartingBalance: 100_000,
		ChipBalance:     100_000,
		Connected:       true,
		TableNumber:     1,
		TableRoomID:     value.ID,
	}
	human := &tournamentParticipant{
		ID:              "human-1",
		Name:            "Player",
		IsHuman:         true,
		EntryIndex:      1,
		StartingBalance: 100_000,
		ChipBalance:     100_000,
		Connected:       true,
		TableNumber:     1,
		TableRoomID:     value.ID,
	}
	value.Participants = map[string]*tournamentParticipant{computer.ID: computer, human.ID: human}
	value.EntryOrder = []string{computer.ID, human.ID}
	value.TableRoomIDs = []string{value.ID}
	tableRoom := &room{
		ID:           value.ID,
		HostPlayerID: human.ID,
		Settings:     settings,
		Tournament:   value,
		TableNumber:  1,
		Seats: []seat{{
			ID:        humanSlotID(0),
			PlayerID:  human.ID,
			Name:      human.Name,
			Connected: true,
		}},
		clients: map[*wsClient]struct{}{},
	}
	hub := &roomHub{
		rooms:       map[string]*room{value.ID: tableRoom},
		tournaments: map[string]*tournament{value.ID: value},
		engine:      engine,
	}
	tableRoom.Game, err = hub.buildTournamentGameLocked(tableRoom, []*tournamentParticipant{computer, human}, 1, computer.ID)
	if err != nil {
		t.Fatalf("build tournament game: %v", err)
	}

	hub.scheduleRoomAutomation(tableRoom.ID)

	if boolValue(tableRoom.Game.State["finished"]) {
		t.Fatal("single-player tournament acted for a connected human")
	}
	if tableRoom.Game.Timer != nil || tableRoom.AutomationTimer != nil {
		t.Fatal("single-player tournament scheduled a human action timeout")
	}
}

func TestTournamentTableViewHidesCardsAndReturnsForOwnTurn(t *testing.T) {
	engine, err := newPokerEngine("../lib")
	if err != nil {
		t.Fatalf("load poker engine: %v", err)
	}
	settings := normalizeTournamentSettings(map[string]any{
		"singlePlayerTournament":    true,
		"initialParticipantCount":   9,
		"humanParticipantCount":     1,
		"tournamentStartingBalance": 1_000_000,
	}, nil)
	value := newTournament("ABC123", "human-1", settings)
	client := &wsClient{roomID: value.ID, playerID: "human-1"}
	lobby := &room{
		ID:           value.ID,
		HumanSlots:   1,
		HostPlayerID: value.HostPlayerID,
		Seats: []seat{{
			ID:        humanSlotID(0),
			PlayerID:  client.playerID,
			Name:      "Player",
			Connected: true,
		}},
		Settings:   settings,
		clients:    map[*wsClient]struct{}{client: {}},
		Tournament: value,
	}
	hub := &roomHub{
		rooms:       map[string]*room{value.ID: lobby},
		tournaments: map[string]*tournament{value.ID: value},
		engine:      engine,
	}
	roomIDs, err := hub.startTournamentLocked(lobby, settings)
	if err != nil {
		t.Fatalf("start tournament: %v", err)
	}
	if len(roomIDs) != 2 {
		t.Fatalf("table count = %d, want 2", len(roomIDs))
	}
	homeRoom := hub.rooms[client.roomID]
	if homeRoom == nil {
		t.Fatal("client home table was not assigned")
	}
	var watchedRoom *room
	for _, roomID := range roomIDs {
		if roomID != homeRoom.ID {
			watchedRoom = hub.rooms[roomID]
		}
	}
	if watchedRoom == nil {
		t.Fatal("another tournament table was not found")
	}
	computerIndex := -1
	for index, entry := range statePlayers(homeRoom.Game.State) {
		if playerID(anyMap(entry)) != client.playerID {
			computerIndex = index
			break
		}
	}
	if computerIndex < 0 {
		t.Fatal("computer participant was not found at the home table")
	}
	homeRoom.Game.State["currentPlayerIndex"] = computerIndex
	homeRoom.Game.State["waitingForHuman"] = false
	client.viewingTournamentTableNumber = watchedRoom.TableNumber
	viewRoom := hub.tournamentViewRoomLocked(homeRoom, client)
	if viewRoom != watchedRoom {
		t.Fatalf("view table = %v, want table %d", viewRoom, watchedRoom.TableNumber)
	}
	public := hub.publicRoom(homeRoom, viewRoom, client)
	publicTournament := anyMap(public["tournament"])
	if !boolValue(publicTournament["spectating"]) || intValue(publicTournament["viewingTableNumber"]) != watchedRoom.TableNumber {
		t.Fatalf("unexpected tournament view metadata: %#v", publicTournament)
	}
	publicTables, ok := publicTournament["tables"].([]map[string]any)
	if !ok {
		t.Fatalf("unexpected public table summary type: %T", publicTournament["tables"])
	}
	if got := len(publicTables); got != 2 {
		t.Fatalf("public table summaries = %d, want 2", got)
	}
	publicState := anyMap(public["gameState"])
	for _, entry := range statePlayers(publicState) {
		for _, card := range anySlice(anyMap(entry)["cards"]) {
			if card != nil {
				t.Fatalf("spectator received a private card: %#v", card)
			}
		}
	}

	humanIndex := statePlayerIndexByID(homeRoom.Game.State, client.playerID)
	if humanIndex < 0 {
		t.Fatal("human participant was not found at the home table")
	}
	homeRoom.Game.State["currentPlayerIndex"] = humanIndex
	homeRoom.Game.State["waitingForHuman"] = true
	homeRoom.Game.State["finished"] = false
	viewRoom = hub.tournamentViewRoomLocked(homeRoom, client)
	if viewRoom != homeRoom || client.viewingTournamentTableNumber != 0 {
		t.Fatal("spectator was not returned to the home table for their turn")
	}
}

func TestLeavingSinglePlayerTournamentRemovesItsTables(t *testing.T) {
	value := &tournament{
		ID:           "ABC123",
		Status:       tournamentStatusRunning,
		Settings:     map[string]any{"singlePlayerTournament": true},
		TableRoomIDs: []string{"ABC123", "ABC123-T2"},
	}
	client := &wsClient{roomID: value.ID, playerID: "human-1"}
	firstRoom := &room{
		ID:         value.ID,
		Settings:   value.Settings,
		Tournament: value,
		clients:    map[*wsClient]struct{}{client: {}},
	}
	secondRoom := &room{
		ID:         "ABC123-T2",
		Settings:   value.Settings,
		Tournament: value,
		clients:    map[*wsClient]struct{}{},
	}
	hub := &roomHub{
		rooms: map[string]*room{
			firstRoom.ID:  firstRoom,
			secondRoom.ID: secondRoom,
		},
		tournaments: map[string]*tournament{value.ID: value},
	}

	hub.detachLocked(client, true)

	if len(hub.rooms) != 0 || len(hub.tournaments) != 0 {
		t.Fatalf("single-player tournament remained after leaving: %d rooms, %d tournaments", len(hub.rooms), len(hub.tournaments))
	}
}

func TestAutomaticHumanActionShowsWhenMuckWouldEndShowdown(t *testing.T) {
	engine, err := newPokerEngine("../lib")
	if err != nil {
		t.Fatalf("load poker engine: %v", err)
	}
	state := map[string]any{
		"finished":           false,
		"showdownPending":    true,
		"currentPlayerIndex": 0,
		"players": []any{
			map[string]any{"id": "human-1", "isHuman": true, "folded": false, "eliminated": false},
			map[string]any{"id": "cpu-1", "isHuman": false, "folded": false, "eliminated": false},
		},
		"revealOrder":     []any{"human-1", "cpu-1"},
		"muckIds":         []any{},
		"showdownResults": []any{},
	}
	if got := automaticHumanAction(engine, state, 0); got != "muck" {
		t.Fatalf("automatic action with two remaining contenders = %q, want muck", got)
	}
	state["muckIds"] = []any{"cpu-1"}
	if got := automaticHumanAction(engine, state, 0); got != "show" {
		t.Fatalf("automatic action for the last unmucked contender = %q, want show", got)
	}
	state["showdownPending"] = false
	if got := automaticHumanAction(engine, state, 0); got != "fold" {
		t.Fatalf("automatic betting action = %q, want fold", got)
	}
}
