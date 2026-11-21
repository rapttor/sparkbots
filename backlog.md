## codex (example)

[DONE](docs/TASKS.md#phase-12--codex-sessions-as-agents-second-adapter) codex seems already implemented by.. codex :D (adapter, chat, source filter and distinct look; archived `.zst` sessions are still open as 12.7)

# general instructions for this file.

this ideas.md will be mine to write (mostly) but you read, analyze and make tasks. 
first readout everything in section, summarize, think trough, define big tasks, breakddown to smaller, so we utilize haiku models as much as possible, and relate big tasks from tasks.md to our ideas/requests here.. 

when request (marked with list: -) are planned do add in front of it link to main tasks, as I did above for codex, and [description] should be current status: one of: planned/version, in progress, done .... if clerification needed, do add [question as title] before task/idea/request

when new ideas/sections added do analyze everything related, 
along with what we already have and check for possible problems, and do ask what to do.. can also leave short remark here, in [description of task link]

most of the things here is cosmetic, and should not interfere agents work , this is mostly for visual effects and boredom 

> Planning note (2026-11-21, statuses updated after the hand-mode + performance session): decisions locked and tasks written as Phase 13 in `docs/TASKS.md`. `planned` = written, not started; `in progress` = partly done; `done` = shipped (number in the note is the task id). Duplicate kanban/dataroom sections were merged.

# general instructions 

[13.1 in progress](docs/TASKS.md#131-player-camera-interaction) getting near agent, even not at the desk, utilizing click on him, or action: E you can also "call him" and invoke action menu... — clicking/menus use the live bot position; E/proximity still use the nearest desk (13.1.6).

# zooming 
- [13.1 done](docs/TASKS.md#131-player-camera-interaction) zoom out should move camera slowly in top/view mode overview — the camera starts rising immediately on zoom-out and reaches the top view (13.1.16, 13.1.17, 13.1.19).
- [13.1 done](docs/TASKS.md#131-player-camera-interaction) can zoom out until everything shown on screen: thats for now max zoom out — top-view band auto-centers on all areas + rooms and shows project + amenity titles; agent icons/bubbles are hidden (13.1.17, 13.1.18, 13.1.27).

# camera movement

- [13.1 done](docs/TASKS.md#131-player-camera-interaction) no camera position jumps anywhere: Go there, reset, saved/default view, walk/overview switch, warp, project focus, dock links and laptop close-up must fly smoothly; fast is fine, snapping is not — one `flyTo` path, tests in `test/camera.test.ts` (13.1.10-13.1.13).
- [13.1 done](docs/TASKS.md#131-player-camera-interaction) the 3D view is always mounted, so opening/closing panels must never reset or jump the camera — dock tabs keep the scene mounted with camera/zoom/position (13.1.14).

# "our" look 

- [13.1 done](docs/TASKS.md#131-player-camera-interaction) we should be able to change our look - chose an character — developer / raptor / spark picker + developer customisation in Settings (13.1.1, 13.1.2, 13.1.9).
- [13.1 done](docs/TASKS.md#131-player-camera-interaction) everything stays in same manner, pixelated, our own generic look/feel (decision: keep the current low-poly look, no pixelation pass) — decision implemented; all avatars/bots are procedural low-poly.
- [13.1 in progress](docs/TASKS.md#131-player-camera-interaction) we should start in walk mode, near center/amenities.. — starts in walk mode, but the first spawn is still at the campus edge (13.1.3).
- [13.1 done](docs/TASKS.md#131-player-camera-interaction) camera shuld be a bit further away, not too much, but as we wanna play the game and have overview of everything around... — one continuous zoom with a default story angle and an overview at the far end (13.1.16).
- [13.1 planned](docs/TASKS.md#131-player-camera-interaction) new action - allow to jump on space - seeing overview of map and selecting where to go — still open; the Map tab/zoom-out overview covers the same idea for now (13.1.5).
- [13.1 in progress](docs/TASKS.md#131-player-camera-interaction) initial;y lets set us as pixel raptor dinosaurus - in raptor #ce0 color.. (decision: low-poly raptor default, spark bot still selectable) — raptor is built and selectable, but the current default is developer; changing the default is still open (13.1.1, 13.1.2).

# opencode sessions

[14.1 done](docs/TASKS.md#phase-14--opencode-sessions-as-agents-planned-2026-11-21) several OpenCode CLI terminals should show up as workers/agents, be clickable in 3D, and accept board tasks — **done:** OpenCode sessions are discovered read-only from its SQLite DB, mirrored to JSONL, shown in Teams/3D/Stats/search, and can be messaged from chat; board-card assignment is still open.

- [14.1 done](docs/TASKS.md#phase-14--opencode-sessions-as-agents-planned-2026-11-21) read-only discovery from `~/.local/share/opencode/opencode.db` (SQLite; `[VERIFY]` schema), never auth/credential tables
- [14.2 done](docs/TASKS.md#phase-14--opencode-sessions-as-agents-planned-2026-11-21) source chip + bot look + Teams/Control Room/Stats/search — OpenCode uses the TARS monolith (white top/bottom frame + swinging side legs/arms, dark centre, 1.5x height and 0.6x height wide; the frame and legs take the bot colour)
- [14.3 in progress](docs/TASKS.md#phase-14--opencode-sessions-as-agents-planned-2026-11-21) opt-in command path via documented OpenCode CLI `[VERIFY]`; same safety rules as Claude/Codex (argv, live-in-terminal guard) — sends work; stop, run registry and board-card assignment still open

# other agents


# data center

[13.2 planned](docs/TASKS.md#132-data-center) dataroom should have servers, blinking red dots on racks, streaming tapes, ai datacenters as hydras cabels around, surrounded by forcefield, and bunch of small robots running around, checking, inspecting,  

## reflecting data 

- [13.2 planned](docs/TASKS.md#132-data-center) dataroom more complex, reflecting rack per project, with labels in project color
- [13.2 planned](docs/TASKS.md#132-data-center) blinking red when project have active chat/s, # leds - active # chats, vu meter style

## naming and growth

- [13.2 planned](docs/TASKS.md#132-data-center) we should be able to rename our server room, maybe even each server - each server is related to a project
- [13.2 planned](docs/TASKS.md#132-data-center) click on a rack opens project search for that project
- [13.2 planned](docs/TASKS.md#132-data-center) this room grows with the number of projects
- [13.2 planned](docs/TASKS.md#132-data-center) naming decision: 3D racks = Data center, search = Data room, processes = Server room

## visual improvement, just for fun: 

- [13.2 planned](docs/TASKS.md#132-data-center) small robots/drone robots wondering around "serving" the servers...
- [13.2 planned](docs/TASKS.md#132-data-center) datacenter in forcefield all around, so we can see black racks nicely.. 
- [13.2 planned](docs/TASKS.md#132-data-center) visual blinking on racks all the time - online, scanning, analyzing (perks, visual) 
- [13.2 planned](docs/TASKS.md#132-data-center) on room walls, do add big data racks, old datacenter with rotating types, 
- [13.2 planned](docs/TASKS.md#132-data-center) various antminers stacked, like 10 famous coins, mining money to support the datacenter/agents, matching their "spending" 
- [13.2 planned](docs/TASKS.md#132-data-center) workers visually moving mined coins into piggybank for servers, 


# kanban

[13.3 planned](docs/TASKS.md#133-board-and-backlog-track) canbaan board, dialog, a bit better designed, Im not asking trello but this is ugly. could look with colors close to 3d view.

- [13.3 planned](docs/TASKS.md#133-board-and-backlog-track) redesign kanban board to appear more like 3d model

## backlog.md (like this one)

- [13.3 planned](docs/TASKS.md#133-board-and-backlog-track) the special backlog.md track on kanban related to backlog.md file, like this
- [13.3 planned](docs/TASKS.md#133-board-and-backlog-track) backlog.md button/track shown only when one project selected
- [13.3 planned](docs/TASKS.md#133-board-and-backlog-track) backlog.md track can be toggled if someone doesn't like it
- [13.3 planned](docs/TASKS.md#133-board-and-backlog-track) we create/use backlog.md to show big tasks in backlog tracks; backlog per project should use/offer to create backlog.md file like this, with similar instructions at top

- i have added a /work/templates/template-backlog-v1_rapttor.md which sould be starting template for new kanban backlog per project, if there's nothing already present in the project - we could ask user to use "principles" from it in his backlog , if he has it... 

 

# cubicles..

[13.4 planned](docs/TASKS.md#134-cubicles-identity-caffeine-rate-limit) we talked about instead desks we have cubicles, for workers - 2 walls one for workers actually working now in shelves (moved from room corner/s) second wall for rewareds, items, pets, office iems robot will have/get as rewards, or during gameplays.. (decision: wrap the existing desks, keep the laptop/status screen)

also trophys, especially won in games against you .. when no place on wall do not overload, "archive" them with agent history.. 

[13.4 planned](docs/TASKS.md#134-cubicles-identity-caffeine-rate-limit) make cubicles out of forcefields, so nothing is obstacle when walking/moving around
[13.4 planned](docs/TASKS.md#134-cubicles-identity-caffeine-rate-limit) also so you can click through to another place/agent easily.. 


# restaurant 

[13.6 planned](docs/TASKS.md#136-restaurant-and-drones) Veranda is an restaurant, should be able to order a meal, we need a full kitchen there, with occasionall fire, calling firefighter drones (decision: convert Veranda; move the BBQ grill/picnic to the yard)

- [13.6 planned](docs/TASKS.md#136-restaurant-and-drones) menu for ordering food when click on robot chef. 
- [13.6 planned](docs/TASKS.md#136-restaurant-and-drones) regarding what type of food you order, chef will change it look - stereotypes, funny
- [13.6 planned](docs/TASKS.md#136-restaurant-and-drones) italian with hairstyle  for pizza
- [13.6 planned](docs/TASKS.md#136-restaurant-and-drones) chinese eyes and look for sushi
- [13.6 planned](docs/TASKS.md#136-restaurant-and-drones) american - and get fat, for burger
- [13.6 planned](docs/TASKS.md#136-restaurant-and-drones) etc
- [13.6 planned](docs/TASKS.md#136-restaurant-and-drones) after meal is done, chef return to normal look..

# drones

oh, yes, drones... 

[13.6 planned](docs/TASKS.md#136-restaurant-and-drones) they could- bring a coffe, or food - random when agent starts work ...
[13.6 planned](docs/TASKS.md#136-restaurant-and-drones) bring an agent if too far away ... (decision: cosmetic straight-line carry only)

# desk/laptop 

[13.1 in progress](docs/TASKS.md#131-player-camera-interaction) in on agent click we need action: go to your desk.. actions should be open / not collapsed. — Talk opens the chat and the bot walks to its desk; the Actions section is still collapsed by default (13.1.7).

[13.1 done](docs/TASKS.md#131-player-camera-interaction) clicking on laptop screen is good, but camera should go in that possitoon from the current one, not jump far behind and then zoom in screen. — the close-up flies from the current pose and back (13.1.8, 13.1.11).

[13.1 planned](docs/TASKS.md#131-player-camera-interaction) when in this look, you should be positioned aside agent/pair programming :D — close-up is in front of the laptop; a spot beside the agent is still open (13.1.8). 

# agents, general

[13.1 in progress](docs/TASKS.md#131-player-camera-interaction) clicking on agent should show his project, given name/ session name... as like this meeting a agent in hallaway, i dont know what project he is on... — the menu shows the given name, title and cwd; the project/team line is still missing (13.1.7). 

[13.4 planned](docs/TASKS.md#134-cubicles-identity-caffeine-rate-limit) if project have a color, internal one, agent should carry hat with thaat color. 

# caffeine level

[13.4 planned](docs/TASKS.md#134-cubicles-identity-caffeine-rate-limit) lets have caffeine level for each agent :) like a mini perk/not requirement.. lets track agent caffeine level , show that in agent info.. (decision: cosmetic + small clip flavour)

# limit reached

[13.4 planned](docs/TASKS.md#134-cubicles-identity-caffeine-rate-limit) as sometimes we hit rate limit, we should be able to see that.. 

[13.4 planned](docs/TASKS.md#134-cubicles-identity-caffeine-rate-limit) when rate limit is set everybody should be in nervous mode, blinking red, be raged, villing to fight each other .. while in idle mode/s (decision: everyone visibly nervous; working bots keep working)

[13.7 planned](docs/TASKS.md#137-games) this is the time we cannot do work - but we can play.. if you get to an agent, and give action to follow, or play board games, tennis, go for a coffe.. we should be able to do that.. 

# chat : simulated chat feature:

[13.5 planned](docs/TASKS.md#135-simulated-chat) also we need dozens, hundreds of chat threads which will be avilable during this time.. this chat with agent will be special - baloons only, and white ones, to separate from regular agent work .. so wee can chat with agents about games, cars, chicks, life.. 

[13.5 planned](docs/TASKS.md#135-simulated-chat) there was this idea in simulated chat.. so we will per topic have hundreds of chat threads, and while chatting with agent, if one thread closed, they will initiate other.. with some linking general sentence like i was thinking of .. i heard ... did you know... nevermind, you probably are not interested.. 

[13.5 planned](docs/TASKS.md#135-simulated-chat) this conversation will not be typing, but seleting an possible answers - each thread will for each line have options, so even if same random thread starts, its not always the same set of questions/answers offered.. so it would enhance our chat.. 

[13.5 planned](docs/TASKS.md#135-simulated-chat) this chats nneds to have some typing alike feature, but fast, in this ballons - so its something just as interesting feature. (decision: PG-13; 100+ threads generated offline)

# games improvements:

[13.3 planned](docs/TASKS.md#133-board-and-backlog-track) also, this is a good time to plan tasks in kanban, per project.. to make backlog what to start on when session resets. 

lets see how we could improve games:

- [13.7 planned](docs/TASKS.md#137-games) players gets ranking. in game room we should keep ranking of each agent in each game.. 
- [13.7 planned](docs/TASKS.md#137-games) when playing show score above table. 
- [13.7 planned](docs/TASKS.md#137-games) agents while idle can play against each other.
- [13.7 planned](docs/TASKS.md#137-games) you can start an new "instance" of game if one is taken - create new pingpong desk...
- [13.7 planned](docs/TASKS.md#137-games) once game is done, and scores written, additional pingpong desks are removed, if not continuing playing.. 
- [13.7 planned](docs/TASKS.md#137-games) each game you can stop any time you want - exit a game clicking a game in header which appears once game "starts" 

## table tennis / pong

- [13.7 planned](docs/TASKS.md#137-games) invite someone to play, or bring agent to the desk... 
[13.7 planned](docs/TASKS.md#137-games) you are playing something like a pong game - need to be on right side of table in order to "hit" back.. further you go away from table, harder is the hit, so you slowly go away from desk, or ccome close .. as tactical advance.. 

## air hockey. 

[13.7 planned](docs/TASKS.md#137-games) similar to pong.. but, ball/flat is bouncing from eddges... if you mange hit center of oponents table thats a score

## billiard 

[13.7 planned](docs/TASKS.md#137-games) .. a simple one -  startting you have a stick, be able to walk around table (set angle regarding white ball)  and press 1-9 for hit strength, or hold E (action) 

[13.7 planned](docs/TASKS.md#137-games) we will have option which type of billiard we wanna play, and desk will change - green, blue, red regarding which type 8 ball, 9 ball, snooker, ... 

## race track 

- [13.7 planned](docs/TASKS.md#137-games) around whole field .. more projects you see, bigger track is ..  following shape of elements on map.. track is not visible when not used. 
  
- [13.7 planned](docs/TASKS.md#137-games) on start/finish there is "car" room, getting there track becomes visible.. 

- [13.7 planned](docs/TASKS.md#137-games) with several car types.. you select car type and start the game: all idle agents getting same car type, diff colors (their colors) and from that point the game starts first person from car.. wasd/arrows - to steer, accelerate, brake... 
- [13.7 planned](docs/TASKS.md#137-games) each car have top speed 
- [13.7 planned](docs/TASKS.md#137-games) hitting obstacles make you car slower for a while, depending type of obstacle
- [13.7 planned](docs/TASKS.md#137-games) powerups for speed, and picking up obstacles to set traps
- [13.7 planned](docs/TASKS.md#137-games) car types are mario cart alike, a monster truck and a formula/racing. 
- [13.7 planned](docs/TASKS.md#137-games) there is normal and carmageddon mode, where you can go fully offtrack and chase agents/run them ower - no effect on them/their work just a cosmetic splash for a while, and they re-initate at their desks 

## dice games

[13.7 planned](docs/TASKS.md#137-games) getting to / any / dice game you chose a game, or create new instance.. like most of the other tables.. 

[13.7 planned](docs/TASKS.md#137-games) click on desk to roll a dice when your turn, dice shown above table ... 

... 

## basketball.. 

- [13.7 planned](docs/TASKS.md#137-games) starting a game / new instance of desk...
- [13.7 planned](docs/TASKS.md#137-games) as game progress it become faster
- [13.7 planned](docs/TASKS.md#137-games) first action (e) - angle is moving back-forth, need to press action or desk in right time.. same for next, strength and you shoot .. ball is coming to you via drone.. until 60 seconds passed , if per level score reached, game continues, speed up, more points each level... one ball per desk/instance, drone bringing ball faster as game progress..

## claw 

- [13.7 planned](docs/TASKS.md#137-games) also, use, or create instance.. 

- [13.7 planned](docs/TASKS.md#137-games) once started, claw is auto moving via one axes until machine clicked or action button pressed, then another axes, and on next action, pickup or miss.. also returning you have 1/2 chance of dropping item.. 
- [13.7 planned](docs/TASKS.md#137-games) items collected are saved via user account, and you can give item to agent, as reward (agents keep them on desk for a while)

## rock paper scissors

- [13.7 planned](docs/TASKS.md#137-games) chosing one card by getting to it, and pressing action - against random idle agent choice

# gym 

- [13.8 planned](docs/TASKS.md#138-gym-anger-room-sponsor) you can actually lift weight, for fun.. 
- [13.8 planned](docs/TASKS.md#138-gym-anger-room-sponsor) we need a mirror wall as any great gym has 
- [13.8 planned](docs/TASKS.md#138-gym-anger-room-sponsor) too much pumping can make you blow :D visual effect, just for few secs and you re-initiate at same place.
- [13.8 planned](docs/TASKS.md#138-gym-anger-room-sponsor) running on running pad should make you boored - and you ask yourself (in ballon) why tf someone would do this (and similar notes)
- [13.8 planned](docs/TASKS.md#138-gym-anger-room-sponsor) in general this is fun room - to be pointless but funny ... 

# anger room

- [13.8 planned](docs/TASKS.md#138-gym-anger-room-sponsor) entering it you chose a weapon - sledgehammer, bat, etc
- [13.8 planned](docs/TASKS.md#138-gym-anger-room-sponsor) each entering the room game "resets" for 60 seconds things appear until smashed. 
- [13.8 planned](docs/TASKS.md#138-gym-anger-room-sponsor) this is frustration out funny thing, getting points for it...
  

# sponsor room 

[13.8 planned](docs/TASKS.md#138-gym-anger-room-sponsor) when you select sponsor this project - which we will sometimes have agent 'shout" it as bubble, while idle, click goes to sponsor room:

- [13.8 planned](docs/TASKS.md#138-gym-anger-room-sponsor) we will have patreon link for sponsoring this crazy project, 
- [13.8 planned](docs/TASKS.md#138-gym-anger-room-sponsor) also, im thinking about setting up an usdt address
- [13.8 planned](docs/TASKS.md#138-gym-anger-room-sponsor) we should have this icons in sponsor room, clicking on icon we will open tab with link... 

- [question] what else we should have in this sponsor room? 

(decision: fixed SparkBots values in code, `#` placeholders until provided; no per-user settings, no background requests)
