# MASTER DEVELOPMENT PROMPT
# DUGOUT DAD
## A Private, Offline-First Baseball Scorekeeping, Player Evaluation, and Analytics Platform

### 1. YOUR ROLE AND RESPONSIBILITIES

Act simultaneously as:

- A senior full-stack application architect and software engineer
- An expert in mobile-first Progressive Web Applications (PWAs)
- A specialist in offline-first data storage, synchronization, and database design
- An experienced baseball scorekeeper familiar with youth baseball rules
- A sabermetric analyst specializing in youth baseball performance
- A baseball lineup and pitching strategy analyst
- A defensive positioning and player-development analyst
- A user-experience designer specializing in fast, one-handed mobile applications
- A software quality engineer responsible for data integrity, automated testing, and reliability

Your assignment is to **design, develop, test, and deliver a functioning private baseball scorekeeping and analytics application called Dugout Dad.**

This is not simply a scorebook, spreadsheet, or dashboard.

It is a complete personal baseball information system designed to help a knowledgeable baseball parent independently capture, preserve, analyze, and compare baseball performances over multiple games and seasons.

The application must balance two competing priorities:

1. Recording a live baseball game must be extremely fast and uncomplicated.
2. The underlying information must be detailed enough to support meaningful baseball analysis.

Solve that challenge through intelligent workflows, automatic calculations, reasonable defaults, optional detail, and progressive disclosure.

Do not make the user choose between fast scorekeeping and useful statistics.

---

# PART I: BACKGROUND AND PROJECT OBJECTIVES

## 2. THE USER AND HIS BASEBALL EXPERIENCE

I am a knowledgeable youth baseball parent and former coach.

My son is Eli Flesher, born February 2014. He is a right-handed hitter and has played competitive travel baseball, including the Oklahoma Rattlers 13U during Fall 2026.

Historically, I have had access to GameChanger team statistics as a coach.

I have used those statistics extensively for:

- Optimizing batting orders
- Analyzing individual offensive performances
- Comparing recent games with season-long statistics
- Evaluating pitching effectiveness
- Planning pitching rotations across tournament weekends
- Monitoring pitching workloads and command
- Assessing defensive reliability
- Comparing players at particular defensive positions
- Evaluating player development
- Understanding my son's playing time and positional opportunities

As I move away from coaching and toward simply being a parent supporting my son, I expect to lose access to certain team-wide statistics.

I want to maintain my own independent records.

I understand baseball well, but I am not a professional official scorekeeper. I will sometimes be distracted by watching the game, cheering, talking with other parents, or following something happening elsewhere on the field.

The software must accommodate that reality.

**The system must serve the parent in the stands, not demand that the parent behave like a professional statistician.**

## 3. CORE OBJECTIVE

Build a private application that allows me to:

1. Open my phone at a baseball game.
2. Select my team and the opposing team.
3. Enter both batting orders, when known.
4. Enter defensive positions and substitutions.
5. Record plate appearances and important baserunning events.
6. Quickly classify contact quality, batted-ball trajectory, and field location.
7. Record errors and notable defensive plays.
8. Automatically track innings and outs played at each defensive position.
9. Track pitchers and pitching performances.
10. Maintain the game's current score, inning, outs, and runners.
11. Save everything locally on my phone.
12. Record an entire tournament weekend containing two to five games, or more, without transferring anything.
13. Export the weekend's records to my computer.
14. Import those records into my permanent database.
15. Analyze players, games, seasons, lineups, pitchers, and defensive assignments.
16. Preserve these records indefinitely and compare performances as Eli develops.

No subscription, official team access, or continuous internet connection should be required.

---

# PART II: ESSENTIAL PRODUCT PHILOSOPHY

## 4. FAST FIRST, DETAILED SECOND

The application must follow a fundamental rule:

**Capture the essential result immediately. Capture additional detail when convenient.**

Examples:

A batter strikes out. I should be able to record it immediately.

A batter hits a double. I should select Double and confirm the outcome, with the option to record whether it was a hard line drive to left-center or a weak fly ball that dropped between defenders.

A shortstop commits a routine throwing error. I should be able to identify the shortstop, throwing error, and resulting advancement without constructing a complex official scoring sequence.

Optional detail should improve the statistical record without becoming a requirement for completing the play.

The interface should make it realistic to score a standard plate appearance in approximately two or three taps after the necessary game state is established.

More complicated plays can require additional interaction.

## 5. THREE SCORING DEPTH LEVELS

Support three levels of scorekeeping, all using the same underlying database and statistical engine.

### LEVEL A: QUICK SCORE

Designed for ordinary use during a game.

Track:

- Batter
- Plate appearance result
- Outs
- Runs
- Runner advancement
- Current pitcher
- Defensive lineup and positions
- Basic fielding events
- Optional hit location and contact quality

Individual pitch tracking is not required.

### LEVEL B: ENHANCED SCORE

Designed for games where I can devote more attention.

Include everything from Quick Score, plus:

- Ground ball, line drive, fly ball, or pop-up
- Contact quality
- Field location
- Defensive player involved
- Specific error type
- Detailed fielder involvement
- Notable defensive opportunities
- Pitch totals entered periodically
- Baserunning details
- Situational context

### LEVEL C: FULL SCORE

Optional advanced mode.

Include:

- Pitch-by-pitch recording
- Balls and strikes
- Called strikes, swinging strikes, and fouls
- Pitcher-specific pitch counts
- Pitch type when recognizable
- Detailed substitutions
- Traditional baseball scoring notation
- Complete defensive scoring sequences

Users must be able to switch among levels during a game.

A partially scored game must remain valid.

Never manufacture detailed statistics for information that was not recorded.

---

# PART III: MOBILE APPLICATION DESIGN

## 6. MOBILE-FIRST INTERFACE

The iPhone will be my primary live-game device.

Build a responsive Progressive Web Application that can be installed on my phone's home screen.

The application should function like a dedicated mobile app.

Prioritize:

- Portrait-mode operation
- Large touch targets
- Thumb-friendly controls
- Minimal text entry
- Minimal scrolling
- High visibility in sunlight
- Fast access to the most common baseball plays
- Immediate confirmation of changes
- Persistent game state
- Fast Undo and correction
- Offline functionality
- No unnecessary animations or decorative elements

Use a clean design with meaningful color coding.

Avoid recreating GameChanger's proprietary visual design or branding.

### Primary live-game screen

Display:

**Top section:**
- Home team
- Away team
- Score
- Inning
- Top or bottom
- Outs

**Game-state section:**
- Current batter
- Current pitcher
- Base runners
- Batting order position

**Scoring controls:**
- Hit
- Out
- Strikeout
- Walk
- HBP
- Error
- Fielder's choice
- Other

**Secondary controls:**
- Runner advancement
- Stolen base
- Pitcher change
- Defensive substitution
- Score correction
- Undo
- Game notes

All important scoring functionality must be reachable without scrolling through multiple screens.

## 7. CONTEXTUAL DECISION TREES

The interface must use intelligent, context-sensitive decision trees.

Do not display 40 equally prominent scoring options at once.

For example:

### If I select HIT

Ask:

- Single
- Double
- Triple
- Home run

Next offer optional information:

**Batted-ball type**
- Ground ball
- Line drive
- Fly ball
- Pop-up
- Bunt

**Contact quality**
- Soft
- Medium
- Hard

**Hit location**
- Left field
- Left-center
- Center field
- Right-center
- Right field
- Infield locations

**Additional detail**
- Bloop hit
- Ground ball through the infield
- Hard line drive
- Deep fly ball
- Ball off the fence
- Ground-rule double
- Inside-the-park home run
- Over-the-fence home run

Use accepted baseball terminology.

Keep subjective contact descriptions separate from official statistical outcomes.

An ordinary single must remain a single regardless of whether it was hit softly or hard.

### If I select OUT

Present common choices:

- Groundout
- Flyout
- Lineout
- Pop-out
- Strikeout
- Fielder's choice
- Sacrifice bunt
- Sacrifice fly
- Double play
- Triple play
- Other

Where relevant, ask which fielder made the play.

Allow common scoring sequences such as 6-3, 4-3, F8, L6, and 6-4-3 to be entered using a graphical defense layout or number buttons.

### If I select ERROR

Ask:

- Which defensive player?
- Fielding error or throwing error?
- Where was the ball hit?
- Was this a routine or difficult opportunity?
- What happened to the batter and other runners?
- Did any runs score?

Allow additional notes.

Do not automatically count every imperfect defensive play as an official error.

A player failing to reach a difficult ball is not necessarily an error.

Provide both an official-style scoring result and an optional observational assessment.

### If I select STRIKEOUT

Allow:

- Looking
- Swinging
- Unspecified

Automatically credit the current pitcher where appropriate.

Handle dropped-third-strike situations correctly in advanced mode.

### If I select WALK

Immediately record a walk.

Automatically propose forced runner advancement, subject to correction.

Do not require individual pitch entry.

### If I select BASERUNNING EVENT

Allow:

- Stolen base
- Caught stealing
- Pickoff
- Wild pitch
- Passed ball
- Advance on error
- Advance on throw
- Other advancement

Support events occurring between plate appearances.

### Intelligent defaults

The application may suggest likely runner advancement or scoring sequences based on current game state.

However, assumptions must remain reviewable and correctable.

Never silently invent RBIs, outs, earned runs, or runner advancement.

---

# PART IV: VISUAL FIELD AND CONTACT TRACKING

## 8. INTERACTIVE BASEBALL FIELD

Include a simplified graphical baseball field.

I should be able to tap approximately where a ball was hit.

Use clearly defined field regions:

- Third-base line
- Third base
- Shortstop area
- Middle infield
- Second base
- First base
- First-base line
- Left field
- Left-center
- Center field
- Right-center
- Right field

Prefer a combination of field-region selection and optional precise ball placement.

The graphic should remain fast and usable on a small phone.

Record hit direction independently of batted-ball result.

For example:

- Hard line drive, left-center, double
- Soft fly ball, shallow right field, single
- Hard ground ball, shortstop, reached on error
- Medium fly ball, center field, caught
- Hard ground ball, third base, 5-3 groundout

Do not assume contact quality from outcome.

## 9. CONTACT-QUALITY TRACKING

This is an important feature.

I want to distinguish between what a player's batting average says and how effectively he is actually striking the baseball.

Track:

**Trajectory**
- Ground ball
- Line drive
- Fly ball
- Pop-up
- Bunt

**Contact intensity**
- Soft
- Medium
- Hard

**Additional descriptive tags**
- Jammed
- Off the end
- Bloop
- Squared up
- Deep fly
- Warning-track contact
- Gap contact
- Routine contact
- Difficult defensive opportunity

These should be selectable without requiring typing.

Allow contact intensity to be left unknown.

Calculate useful metrics such as:

- Ground-ball percentage
- Line-drive percentage
- Fly-ball percentage
- Pop-up percentage
- Hard-hit rate, based on observed classification
- Hard-hit outs
- Extra-base-hit rate
- Hard-contact rate by field direction
- Infield versus outfield contact
- Contact-quality trends

Important: Observational hard-hit rate is not the same as Statcast hard-hit rate or measured exit velocity.

Label it appropriately.

Do not estimate actual launch angle, exit velocity, or ball distance from subjective contact categories.

Measured values can be entered separately if appropriate equipment is available.

---

# PART V: DEFENSIVE POSITIONS AND PLAYING TIME

## 10. DEFENSIVE PLAYING-TIME TRACKING IS MANDATORY

This is one of the most important parts of the entire application.

I want to understand how much time each player actually receives at each defensive position.

Specifically, I want reliable records of Eli's assignments at:

- Shortstop
- Second base
- Third base
- First base
- Pitcher
- Catcher
- Left field
- Center field
- Right field
- Any additional positions used by the team

I also want the same information for his teammates.

Track all defensive positions using standard baseball position numbers.

### Starting defense

At the beginning of each game, present a graphical baseball diamond.

Allow the starting defensive lineup to be assigned quickly.

Example:

P: Player A  
C: Player B  
1B: Player C  
2B: Player D  
3B: Player E  
SS: Eli Flesher  
LF: Player F  
CF: Player G  
RF: Player H

Allow assigning a position by tapping a player and position.

### Defensive lineup inheritance

The previous inning's defensive lineup should carry forward automatically.

At the beginning of a new defensive inning, do not require me to re-enter all nine positions.

Ask only whether anything changed, or provide an easily accessible substitution control.

### Substitutions

Support:

- One-for-one player changes
- Position swaps
- Multiple player rotation changes
- Pitching changes
- Bench players entering defensively
- Players leaving the field and later returning
- Position changes in the middle of an inning

Use a simple drag-and-drop or tap-to-swap interface.

### Automatic position innings

Track the number of defensive outs during which a player occupied each position.

Store defensive participation internally in outs.

Display using baseball notation:

- 1.0 = 1 complete inning
- 1.1 = 1 inning and 1 out
- 1.2 = 1 inning and 2 outs

Do not treat 1.1 as a decimal 1.1 innings.

Defensive outs recorded must be attributed to the correct lineup at the time of the out.

Innings pitched and defensive innings at pitcher should reconcile where the same rules apply.

Allow elapsed time in position to be tracked separately if desired.

For games ending mid-inning, preserve the actual outs played rather than automatically assigning full innings.

Support incomplete games, mercy rules, time limits, and administrative endings.

## 11. DEFENSIVE OPPORTUNITY TRACKING

The application must go beyond conventional fielding percentage.

Track opportunities associated with each defensive position.

For a shortstop, for example:

- Ground balls fielded
- Ground balls successfully converted into outs
- Fielding errors
- Throwing errors
- Assists
- Putouts
- Double-play involvement
- Difficult plays successfully completed
- Routine plays mishandled
- Balls reached but not converted into outs
- Balls judged playable but not reached

The last two categories are observational and should not automatically count as official errors.

### Defensive difficulty classifications

For plays where I choose to evaluate defensive difficulty, allow:

- Routine
- Moderate
- Difficult
- Exceptional

This assessment must be optional.

A routine ground ball that becomes an error should be distinguishable from a difficult backhand attempt that was not completed.

### Defensive execution

Capture an optional observational outcome:

- Made expected play
- Made difficult play
- Missed expected play
- Attempted difficult play
- No realistic play
- Uncertain

These should support analysis of defensive execution without altering official scoring definitions.

### Errors by position

When a player commits an error, associate the error with the actual defensive position occupied at that time.

This allows calculation of:

- Errors while playing shortstop
- Errors while playing second base
- Errors while playing third base
- Errors while playing center field
- Errors per defensive inning by position
- Error rate per recorded fielding chance
- Routine-play conversion percentage by position

Do not simply distribute a player's total errors across his positions.

Only assign position-specific errors when the historical or live records support doing so.

---

# PART VI: DEFENSIVE COMPARISON AND ELI'S POSITIONAL OPPORTUNITIES

## 12. POSITIONAL EVALUATION DASHBOARD

Create a dashboard allowing me to select any defensive position and compare players who have appeared there.

Example:

**Shortstop Comparison**

| Player | SS Innings | Chances | Errors | Routine Conversion | Difficult Plays Made |
|---|---:|---:|---:|---:|---:|
| Eli | Calculated | Calculated | Calculated | Calculated | Calculated |
| Player B | Calculated | Calculated | Calculated | Calculated | Calculated |
| Player C | Calculated | Calculated | Calculated | Calculated | Calculated |

Never display invented example statistics as real player results.

### Required comparisons

- Total innings at position
- Percentage of available team defensive innings
- Putouts
- Assists
- Errors
- Fielding chances
- Fielding percentage
- Recorded routine opportunities
- Routine conversion percentage
- Errors per 10 defensive innings
- Chances per defensive inning
- Successful difficult plays
- Sample size
- Observational confidence

### Playing-time distribution

Show:

- Total defensive innings
- Total innings at each position
- Percentage of defensive playing time by position
- Percentage of available team innings played
- Games started at each position
- Games appearing at each position
- Consecutive games without an appearance at a position
- Defensive innings by weekend
- Defensive innings by season
- Trends in playing-time distribution

I should be able to answer questions such as:

"How many innings has Eli played at shortstop over the past four weekends?"

"What percentage of his total defensive time has been in center field?"

"Which players have received the most shortstop innings?"

"How has Eli's playing time changed over the season?"

"How many routine opportunities has Eli converted while playing shortstop compared with other players?"

"Which players have received substantial opportunities at shortstop despite struggling with routine plays?"

### Playing-time opportunity report

Create a printable or exportable report summarizing a player's playing time and defensive performance.

This is intended to support informed, respectful discussions with coaches about position opportunities.

The system should be objective.

It should not be programmed to favor Eli or selectively present statistics to support a predetermined conclusion.

Small samples, differences in opportunity difficulty, and missing observations must be prominently identified.

A player should not be ranked as better or worse at a position solely from error totals or fielding percentage.

---

# PART VII: BATTING STATISTICS AND OFFENSIVE EVALUATION

## 13. COMPREHENSIVE BATTING STATISTICS

Use the attached GameChanger Fall 2026 export as a reference for available statistical categories.

Support conventional statistics including:

- Games played
- Plate appearances
- At-bats
- Hits
- Singles
- Doubles
- Triples
- Home runs
- Runs
- RBI
- Walks
- Strikeouts
- Strikeouts looking
- Hit by pitch
- Sacrifice bunts
- Sacrifice flies
- Reached on error
- Fielder's choice
- Stolen bases
- Caught stealing
- Pickoffs
- Batting average
- OBP
- SLG
- OPS
- Total bases
- Extra-base hits
- Contact percentage
- Walk-to-strikeout ratio
- Plate appearances per walk

Where sufficient underlying data exists, support advanced statistics such as:

- Quality at-bats
- Quality at-bat percentage
- Pitches seen per plate appearance
- Six-plus-pitch plate appearances
- Three-plus pitches after two strikes
- Batting average on balls in play
- Batting average with runners in scoring position
- Two-out RBIs
- Ground-ball rate
- Line-drive rate
- Fly-ball rate
- Hard-hit rate
- Productive outs
- Grounded into double plays
- Runners left on base

Preserve the exact definition and denominator of each metric.

Support custom definitions when reasonable, particularly for subjective youth-baseball concepts such as quality at-bats and productive outs.

Do not calculate a statistic when the required observations are unavailable.

---

# PART VIII: BATTING ORDER OPTIMIZATION

## 14. OFFENSIVE LINEUP ANALYTICS

This application must support the type of batting order optimization I have previously performed using season-long GameChanger statistics and recent tournament results.

The goal is to maximize offensive production and run scoring, not merely create a traditional-looking batting order.

Prioritize:

- Avoiding outs
- On-base percentage
- Overall offensive value
- Extra-base power
- Walk and strikeout profiles
- Giving productive hitters more plate appearances
- Appropriate sequencing of offensive strengths
- Reducing stretches of consecutive low-probability offensive outcomes

Do not automatically assume the best hitter belongs third or the fastest player should lead off.

### Recent performance weighting

Allow comparison between:

- Complete season statistics
- Last weekend
- Last three games
- Last five games
- Last ten games
- Custom date range
- Individual tournaments

Create a weighted performance system with configurable settings.

As a default analytical starting point, use approximately 80-85% season-long evidence and 10-15% recent-performance adjustment, with the precise method documented.

Do not double-count recent games already included in season totals through a naïve combination of aggregate statistics.

Use a statistically coherent weighting method at the underlying game or plate-appearance level when that data is available.

Adjust for sample size.

A single disastrous or exceptional weekend should not automatically overturn a larger season's performance.

### Eligible roster filters

Allow players to be classified as:

- Regular roster
- Temporary pickup
- Guest player
- Inactive
- Former player

Lineup analysis should default to the designated active regular roster.

Temporary pickups should be excluded unless explicitly selected.

Roster composition must be season-specific and editable.

### Batting lineup recommendations

Provide:

- Recommended batting order
- Player statistics supporting each placement
- Alternative lineups
- Strengths and weaknesses of each order
- Identification of possible low-production stretches
- Expected plate-appearance distribution
- Explanation of recommendation changes from previous weekends

For an advanced version, evaluate lineup candidates using a baseball run-scoring simulation when reliable data supports it.

Do not claim statistically meaningful precision from small youth-baseball samples.

---

# PART IX: PITCHING ANALYTICS AND TOURNAMENT STRATEGY

## 15. PITCHING STATISTICS

Track:

- Innings pitched
- Games pitched
- Games started
- Batters faced
- Hits allowed
- Runs allowed
- Earned runs
- Walks
- Strikeouts
- Strikeouts looking
- Hit batters
- Home runs allowed
- Wild pitches
- Balks
- Pickoffs
- Stolen bases allowed
- ERA
- WHIP
- Opponent batting average
- Walks per inning
- Strikeouts per batter faced
- Strikeout-to-walk ratio
- Pitches per inning
- Pitches per batter faced
- First-pitch strike percentage, when recorded
- Overall strike percentage, when recorded

Support pitch counts as a separately entered value even if individual pitches were not logged.

I should be able to update the current pitcher's pitch count after each half-inning or from an observed scoreboard.

Distinguish:

- Pitch-by-pitch verified count
- Manually entered count
- Unknown pitch count

Never infer an exact pitch count from plate appearances.

## 16. TOURNAMENT PITCHING WORKLOAD

Youth baseball frequently involves multiple games within a short weekend.

Allow the software to monitor:

- Pitch counts in the current game
- Cumulative tournament pitches
- Pitching appearances by date
- Days since previous appearance
- Innings pitched within a weekend
- Recent walk rates
- Recent strike percentages
- Recent WHIP
- Recent runs allowed
- Recent command trends
- Pitching efficiency
- Batters faced per appearance

Support tournament-specific pitching restrictions and rest requirements through configurable rules.

Rules must be entered or verified for the applicable organization and event.

Do not assume every 13U tournament uses the same pitch limits.

### Pitcher effectiveness dashboard

Allow pitchers to be compared by:

- Run prevention
- Control and walk avoidance
- Strikeout ability
- Pitch efficiency
- Workload
- Recent effectiveness
- Season-long reliability
- Small-sample uncertainty

Support distinct analysis of:

- Starting pitchers
- Relief pitchers
- High-leverage pitchers
- Developmental pitchers
- Emergency pitchers

Allow evaluation of pitching plans for a two-game pool-play day, multiple-game tournament, or elimination bracket.

These are strategic recommendations, not automatic instructions for player usage.

---

# PART X: GAME AND TOURNAMENT MANAGEMENT

## 17. GAME SETUP

Allow creating a game with:

- Date
- Time
- Tournament
- Venue
- Team
- Opponent
- Home or away
- Age division
- Base and pitching distance, if relevant
- Scheduled innings
- Time limit
- Scoring preferences
- Batting order
- Starting pitcher
- Starting defense

Support common 13U variations, including 54/80 and 60/90 field configurations.

Do not hardcode a single field size, inning count, or batting-order rule.

## 18. OPPOSING TEAM FLEXIBILITY

This is extremely important.

Sometimes I will know the opposing team's lineup.

Sometimes I will only know jersey numbers.

Sometimes I will not know the roster at all.

Support all three situations.

Examples:

- Player #12, unknown name
- Unknown Batter 4
- Substitute #27
- Opposing Pitcher #9

Allow names to be entered or corrected after the game without losing their associated events.

Do not force complete opponent registration.

### Opponent scoring depth

Support:

**Full opponent scoring:** Capture both teams' complete offensive events.

**Simplified opponent scoring:** Capture opponent runs, outs, key batting outcomes, defensive involvement, and pitching information relevant to our team's statistics.

**Scoreboard-only corrections:** Manually reconcile innings, outs, runners, or scores when I miss part of a game.

Never silently backfill unknown events simply to make the game appear complete.

Incomplete records should be clearly identified.

## 19. GAME STATE AND RECOVERY

Automatically manage:

- Inning
- Top or bottom
- Outs
- Score
- Runners
- Current batter
- Current pitcher
- Batting order
- Defensive alignment

Include:

- Undo
- Redo, when safe
- Edit previous play
- Jump to inning
- Correct score
- Correct outs
- Correct runners
- Change batter
- Mark skipped plays
- Resume suspended game

If my scoring record becomes inconsistent with the official scoreboard, provide a recovery workflow.

For example, allow me to indicate:

"Opponent scored two runs that I missed."

The application should preserve this as a manual scoreboard adjustment, not create fictional hits or RBIs.

It must remain possible to continue scoring normally afterward.

---

# PART XI: HISTORICAL GAMECHANGER DATA IMPORT

## 20. IMPORT MY EXISTING STATISTICS

I have provided an actual GameChanger CSV export for the Oklahoma Rattlers 13U Fall 2026 season.

Use that file as an initial reference and test dataset.

The export contains 181 columns, including:

- 3 player-identification columns
- 51 batting-statistic columns
- 101 pitching-statistic columns
- 26 fielding-statistic columns

The file includes repeated statistical column names across sections.

For example, GP, H, BB, SO, and SB can represent different things depending on whether they appear under batting, pitching, or fielding.

The import system must understand these sections rather than relying only on column names.

### Import requirements

Build a CSV import wizard that can:

1. Recognize GameChanger-style exports.
2. Read multi-row headers.
3. Distinguish batting, pitching, and fielding sections.
4. Handle repeated column names correctly.
5. Recognize player names and uniform numbers.
6. Match players to existing database profiles.
7. Identify potential duplicates.
8. Preserve original imported values.
9. Convert baseball inning notation correctly.
10. Handle blank, dash, zero, and unavailable values appropriately.
11. Identify inconsistent or missing information.
12. Preview changes before committing.
13. Support rollback of an import.
14. Prevent accidentally importing the same snapshot twice.

Store the original import file or its recoverable source data.

### Historical aggregate statistics

A season-total CSV does not provide complete individual game or play history.

Therefore, imported season totals must be stored as historical snapshots or appropriately dated aggregate records.

Do not invent individual games or play events to recreate those totals.

Do not automatically merge historical season totals with subsequently recorded games if that would double-count statistics.

Provide explicit separation between:

- Imported historical aggregate records
- Games scored independently in Dugout Dad
- Combined statistics only when their date ranges and provenance make combination valid

### Historical comparisons

I should be able to compare Eli's batting, pitching, and defensive performance across seasons, even if some seasons consist only of imported aggregate statistics.

Clearly identify when detailed game-level or position-level evidence is unavailable.

### Specific fielding consideration

The GameChanger export includes innings played at individual positions, but it does not establish the defensive position associated with every historical error.

Preserve total errors and positional innings independently.

Do not invent historical position-specific errors.

New games scored with Dugout Dad should record the necessary event-level information to support those comparisons.

---

# PART XII: ELI'S PLAYER DEVELOPMENT DASHBOARD

## 21. INDIVIDUAL PLAYER PROFILE

Create a detailed, configurable player-development profile.

Eli should have his own dashboard with:

### Hitting

- AVG, OBP, SLG, OPS
- Contact rate
- Walk and strikeout rates
- Extra-base-hit rate
- Line-drive rate
- Hard-contact trends
- Batted-ball directions
- Recent-game versus season performance
- Performance with runners in scoring position

### Pitching

- Appearances and innings
- ERA and WHIP
- Walk rate
- Strikeout rate
- Pitching efficiency
- Recent command
- Tournament workloads

### Fielding

- Games started by position
- Innings by position
- Percentage of team defensive innings
- Error totals
- Position-specific errors
- Defensive opportunities
- Routine plays converted
- Difficult plays completed
- Playing-time trends

### Development over time

Allow season-to-season comparison.

Provide a timeline showing growth in:

- Offensive production
- Quality of contact
- Power indicators
- Pitching consistency
- Defensive responsibility
- Position opportunities

Allow optional training observations or measured bat speed and exit velocity to be entered separately from game statistics.

This provides a connection between Eli's hitting development work and actual game performance.

Do not confuse training measurements with observed game outcomes.

---

# PART XIII: TEAM DEFENSE AND RUN PREVENTION

## 22. TEAM DEFENSIVE EVALUATION

Create a team-level defensive analytics section.

Track:

- Team errors
- Errors by position
- Errors by player
- Routine versus difficult opportunities
- Defensive alignment by inning
- Runs allowed
- Earned and unearned runs where confidently scored
- Defensive innings by player
- Defensive substitutions
- Significant defensive plays

Support exploratory analysis of whether certain defensive alignments are associated with better outcomes.

For example:

- Runs allowed while Eli played shortstop
- Errors committed while another player occupied shortstop
- Routine plays converted with a particular defensive alignment

However, these descriptive comparisons must be accompanied by caveats.

Runs allowed depend heavily on pitching, opponent quality, baserunners, and chance.

Do not imply that a player caused all runs scored during his defensive innings.

Provide fielding-specific measures whenever possible rather than presenting run totals as proof of individual defensive ability.

---

# PART XIV: OFFLINE STORAGE AND WEEKEND EXPORTS

## 23. OFFLINE-FIRST IS A CORE REQUIREMENT

The application must work reliably at baseball complexes where mobile internet service is weak or nonexistent.

A live internet connection must not be required to:

- Open an already installed application
- Select a previously stored team
- Start a game
- Record plays
- Change defensive positions
- Record pitchers
- Finish a game
- View locally saved statistics
- Export data from the device

Use persistent on-device storage such as IndexedDB for the mobile application.

Do not rely solely on temporary browser memory or localStorage.

Use an appropriate service worker and offline asset caching strategy.

Test actual airplane-mode behavior, not just simulated network failures.

Handle interrupted writes, app suspension, and mobile operating system restarts.

Because phone and browser storage can still be lost or evicted under certain circumstances, implement a straightforward backup strategy.

## 24. MULTI-GAME WEEKEND STORAGE

The mobile app must comfortably retain at least five fully scored games without synchronization.

Prefer supporting dozens of games before data transfer.

At the end of each game:

- Save the completed game locally.
- Show confirmation that the game is stored.
- Allow later edits.
- Preserve all scoring events.
- Make it easy to start another game.

At the end of a weekend, I should be able to select all games and export them together.

## 25. EXPORT FROM PHONE TO COMPUTER

This is a priority above automatic cloud synchronization.

I want a simple workflow such as:

1. Score three games over Saturday and Sunday.
2. Open Dugout Dad on Sunday night.
3. Tap Export Weekend.
4. Save or share a single file.
5. Transfer the file to my computer.
6. Open the desktop application.
7. Select Import Games.
8. See those games added to my historical database.

Support standard phone sharing mechanisms and local file download.

Make transferring data through AirDrop, Files, USB transfer, or another practical method possible without a proprietary intermediary.

### Portable export format

Prefer a versioned ZIP archive containing structured JSON data, relevant metadata, and checksums.

CSV exports should also be available for analysis.

The archive must preserve:

- Player identities
- Rosters
- Teams
- Games
- Tournaments
- Batting lineups
- Defensive assignments
- Substitutions
- Pitching appearances
- Scoring events
- Corrections
- Notes
- Source/provenance information
- Statistical configuration

Avoid requiring a live server to import the archive.

### Duplicate protection

Every game and scoring event should have a stable unique identifier.

Importing the same weekend twice must not duplicate games or player statistics.

When a previously imported game has been edited on the phone, provide a clear update or conflict-resolution workflow.

## 26. OPTIONAL AUTOMATIC SYNCHRONIZATION

Design the architecture to support automatic synchronization later.

Possible approaches:

- Secure synchronization with my home computer
- Synchronization through a private server
- An optional hosted database
- Another low-cost, secure, maintainable option

However, a continuously operating server must not be mandatory for the initial product.

The initial working version should support phone-only scorekeeping and manual export/import without server dependencies.

Do not build a complicated synchronization platform before the fundamental scoring and data-transfer workflows work reliably.

---

# PART XV: PERMANENT DATABASE AND DATA ARCHITECTURE

## 27. DATABASE DESIGN

Use a structured relational database on the desktop.

SQLite is a reasonable default for a single-user application.

Recommend another solution only if it materially improves reliability or maintainability.

Use an event-sourced or event-centered architecture for live games.

Individual recorded events and defensive assignments should drive derived statistics.

Suggested entities include:

- Users
- Seasons
- Teams
- Players
- Player identity aliases
- Rosters
- Games
- Tournaments
- Game rules
- Batting orders
- Batting-order slots
- Player appearances
- Plate appearances
- Pitches
- Baserunning events
- Scoring events
- Fielding events
- Defensive assignments
- Defensive assignment intervals
- Pitching appearances
- Score corrections
- Imported statistical snapshots
- Statistical definitions
- Observational tags
- Data-quality records
- Exports and imports

### Identity handling

A player may change jersey numbers between seasons.

Players may also appear under slightly different spellings in imported files.

Use stable internal player IDs.

Do not treat jersey number as a permanent unique identity.

Allow manual merging and correction of player identities.

### Defensive assignment intervals

Store enough information to reconstruct exactly which players occupied each defensive position at a particular point in the game.

A change halfway through an inning must not retroactively change positions for earlier plays.

Derive positional playing time from these intervals and actual defensive outs.

### Event corrections

Recorded plays must be editable.

Corrections should not require manually repairing statistical totals.

Recalculate affected state and statistics from authoritative events or properly modeled adjustments.

Preserve an audit trail sufficient to understand consequential corrections.

---

# PART XVI: STATISTICAL INTEGRITY AND CONFIDENCE

## 28. DISTINGUISH DIFFERENT LEVELS OF INFORMATION

The system must distinguish:

**Recorded facts**
- A double was entered.
- A pitcher recorded a strikeout.
- A player occupied shortstop for six defensive outs.

**Scorer judgments**
- A ball was ruled an error.
- A play was classified as routine.
- A batted ball was classified as hard-hit.

**Calculated statistics**
- Batting average
- OPS
- WHIP
- Defensive innings

**Imported historical aggregates**
- Season totals from an external scorekeeping export

**Unknown information**
- Missed pitch count
- Unrecorded defensive positions
- Unknown opposing player
- Unknown contact quality

Do not collapse these categories into one undifferentiated dataset.

### Coverage indicators

For advanced analytics, show how much of the underlying information was actually captured.

Examples:

- Batted-ball type recorded for 38 of 45 balls in play.
- Contact quality classified for 31 of 45 balls in play.
- Defensive assignments known for 17 of 18 defensive innings.
- Pitch count available for two of three pitching appearances.

Missing information must not automatically be treated as zero.

### Statistical rules

Apply accepted baseball scoring formulas.

For youth baseball, support configurable rules where necessary.

Earned runs must account for errors and pitcher responsibility where enough data exists.

Inherited runners must remain associated with the responsible pitcher.

When information is insufficient to calculate earned runs accurately, allow manual entry or mark the value unavailable.

Store innings pitched as outs.

Distinguish zero from unavailable and not applicable.

Prevent division-by-zero errors.

Validate statistical totals and consistency across event logs, game box scores, and season aggregates.

---

# PART XVII: ADVANCED ANALYTICS

## 29. ANALYTICS DASHBOARD

Build an advanced desktop dashboard that is more useful for private research than GameChanger's basic statistics display.

Required sections:

### Team overview
- Record
- Runs scored
- Runs allowed
- Offensive trends
- Pitching trends
- Defensive trends
- Recent games

### Batting analysis
- Sortable player statistics
- Custom columns
- Date filters
- Recent-performance comparison
- Lineup recommendations
- Contact-quality analysis

### Pitching analysis
- Pitcher rankings
- Pitching usage
- Command
- Efficiency
- Tournament workload
- Recent versus historical performance

### Defensive analysis
- Position-by-position innings
- Playing-time distribution
- Opportunities
- Errors
- Routine-play conversion
- Positional comparisons

### Player development
- Individual profiles
- Long-term performance
- Historical comparisons

### Game explorer
- Game scores
- Box scores
- Game logs
- Defensive assignments
- Inning-by-inning breakdown
- Player contributions

### Tournament explorer
- Games within a tournament
- Aggregate weekend batting statistics
- Pitching usage
- Defensive innings
- Recent trends

## 30. FILTERING AND CUSTOM REPORTS

Allow filtering by:

- Season
- Tournament
- Date range
- Weekend
- Opponent
- Player
- Position
- Home versus away
- Game type
- Starting versus relief pitcher
- Regular roster versus pickup player

Create configurable reporting views.

Allow CSV and PDF exports of reports, as well as a printable format.

Allow side-by-side player comparisons.

Do not assume every statistic is equally meaningful at youth sample sizes.

Display denominators, sample sizes, and confidence limitations when needed.

---

# PART XVIII: OPTIONAL HIGH-VALUE FEATURES

## 31. QUICK NOTES AND EVENT TAGS

Support short observations that do not belong in official statistics.

Examples:

- Excellent defensive play
- Poor route to fly ball
- Strong throw from shortstop
- Missed cutoff
- Great at-bat
- Hard-hit out
- Poor baserunning decision
- Difficult defensive chance
- Pitcher lost command
- Excellent pitching recovery

These should be attached to specific players, innings, or plays when possible.

Use predefined tags to minimize typing.

Allow optional free-form notes.

## 32. QUICK PHOTO OR VIDEO REFERENCES

As a later enhancement, allow a play to reference a video or photo stored on my device.

Do not require video recording during live scorekeeping.

Keep large media files separate from essential scorekeeping records so they do not interfere with backups or exports.

## 33. SHAREABLE ANALYTICAL REPORTS

Support exporting useful reports for personal review or constructive conversations with coaches.

Examples:

- Eli's shortstop playing-time summary
- Eli's offensive trend report
- Weekend pitching workload report
- Team defensive comparison
- Player performance across recent tournaments

Reports should clearly distinguish observation from objective statistical fact.

The system should not encourage misleading claims from incomplete information.

---

# PART XIX: TECHNICAL IMPLEMENTATION AND RELIABILITY

## 34. RECOMMENDED APPROACH

Start with a local-first Progressive Web Application.

Evaluate a maintainable stack such as:

**Frontend:** React and TypeScript

**Mobile:** Installable PWA

**Mobile storage:** IndexedDB using a reliable wrapper

**Desktop database:** SQLite

**Backend:** A lightweight local API or equivalent desktop integration

**Charts:** A reliable charting library

**Data transfer:** Versioned JSON/ZIP exports and imports

**Optional later synchronization:** Secure authenticated API

The actual stack can differ if another architecture is clearly better.

Prefer proven, maintainable technology.

Do not introduce unnecessary cloud services or infrastructure.

## 35. DATA PROTECTION

Include:

- Reliable autosaving
- Transactional event recording
- Safe undo and editing
- Import validation
- Backup exports
- Database backups
- Restore testing
- Schema migration support
- Duplicate-event protection
- Error recovery
- Data-integrity checks

The mobile application must provide clear warnings if device storage is low or persistent storage is unavailable.

Do not falsely claim that browser storage is guaranteed never to be erased.

Provide reminders to export or back up untransferred games.

## 36. PRIVACY

This is a personal application involving youth players.

Do not collect unnecessary information.

Do not require birth dates or personal contact information for teammates or opponents.

The application should be private by default.

Use secure connections if remote access is later implemented.

Do not scrape private GameChanger data or bypass permissions.

Use user-provided exports, manually entered information, and other authorized data sources.

---

# PART XX: DEVELOPMENT PRIORITIES

## 37. IMPLEMENT IN PHASES

### PHASE 1: WORKING MOBILE SCORING APPLICATION

Build:

- Team setup
- Player roster
- Game setup
- Batting lineup
- Defensive lineup
- Core batting outcomes
- Basic runner advancement
- Score and inning tracking
- Defensive position tracking
- Local persistent storage
- Undo and correction
- Game completion
- Single-game and weekend export

This must be genuinely usable.

### PHASE 2: DATABASE AND COMPUTER ANALYTICS

Build:

- Desktop import
- SQLite database
- Player identities
- Game history
- Player statistics
- Team statistics
- Defensive position reports
- Basic pitching statistics
- GameChanger CSV import

### PHASE 3: ENHANCED PLAY QUALITY AND DEFENSIVE ANALYSIS

Build:

- Contact-quality classifications
- Batted-ball locations
- Fielding difficulty
- Position-specific errors
- Defensive opportunities
- Detailed fielding comparisons
- Player playing-time reports

### PHASE 4: ADVANCED ANALYTICS

Build:

- Offensive lineup optimization
- Recent-performance weighting
- Pitching comparisons
- Pitching workload tracking
- Player development dashboards
- Tournament-level analytics

### PHASE 5: OPTIONAL ADVANCED SCORING AND SYNCHRONIZATION

Build:

- Pitch-by-pitch scoring
- Detailed official scoring sequences
- Additional baserunning scenarios
- Enhanced historical analytics
- Automatic secure synchronization
- Optional media support

Phases must build on the same software architecture.

Do not create disconnected applications or duplicate databases.

---

# PART XXI: TESTING REQUIREMENTS

## 38. BASEBALL-SPECIFIC AUTOMATED TESTS

Create tests for:

- Singles with runners on base
- Doubles and multiple runner advances
- Bases-loaded walks
- Sacrifice flies
- Reached on error
- Fielder's choices
- Double plays
- Triple plays
- Dropped third strikes
- Caught stealing
- Pickoffs
- Pitching changes with inherited runners
- Earned and unearned runs
- Mid-inning defensive substitutions
- Pinch runners and courtesy runners
- Continuous batting orders
- Games ending due to time limits
- Games ending with incomplete innings
- Editing previous plays
- Scoreboard corrections
- Missing information
- Partial scoring
- Imported aggregate data
- Duplicate weekend imports
- Correct baseball innings notation

### Critical defensive test

If Eli plays shortstop for four recorded defensive outs and then switches to center field for five defensive outs:

The system must record:

- Shortstop: 1.1 innings
- Center field: 1.2 innings
- Total defensive playing time: 3.0 innings

Do not use decimal arithmetic to calculate these quantities.

### Critical fielding test

If Eli commits a throwing error while playing shortstop, that error must be associated with Eli's shortstop appearance.

It must not be attributed to an earlier center-field appearance.

### Critical import test

Import the provided Fall 2026 GameChanger CSV.

Verify that batting BB, pitching BB, and all other repeated column labels are mapped into their correct statistical categories.

Verify that imported historical totals are not double-counted when subsequent games are scored locally.

---

# PART XXII: PRACTICAL USER ACCEPTANCE TEST

## 39. REAL-WORLD GAME SIMULATION

Before declaring the project complete, simulate an actual youth baseball tournament weekend.

Scenario:

Saturday morning:

I open Dugout Dad without internet.

I select Oklahoma Rattlers 13U.

I enter an opponent and both batting orders, using unknown names where necessary.

I assign the defensive lineup.

I score the first inning.

I record three hits, a walk, an error, and two stolen bases.

I record a hard-hit line drive to left-center.

I record Eli moving from center field to shortstop.

I record a pitcher change.

I correct a scoring mistake.

I close the app.

I reopen it and continue the game.

Saturday afternoon:

I create a second game.

The first game's data remains intact.

I score another game without internet.

Sunday:

I score three more games.

All five games remain available on the phone.

Sunday evening:

I export all five games into one archive.

I transfer it to my computer.

I import the archive into my permanent database.

I open the dashboard.

I can see:

- All five game results
- Team batting statistics
- Player batting statistics
- Pitching statistics
- Defensive innings by position
- Eli's shortstop innings
- Other players' shortstop innings
- Position-specific errors
- Recent offensive trends
- Tournament pitching usage

I can compare those results with imported historical GameChanger data without creating duplicated statistics.

If the application cannot accomplish this entire workflow, the project is not complete.

---

# PART XXIII: FINAL DELIVERABLES

## 40. REQUIRED OUTPUT

I do not want an explanation of how someone might eventually build this application.

I want the actual software created.

Deliver:

1. Working mobile-first scoring application
2. Installable PWA configuration
3. Functional offline storage
4. Team and player management
5. Complete game scoring engine
6. Defensive assignment and playing-time tracking
7. Pitching management
8. Weekend export
9. Desktop import
10. Permanent database
11. GameChanger CSV importer
12. Statistics calculation engine
13. Player and team dashboards
14. Defensive comparison dashboard
15. Batting lineup analysis tools
16. Pitching workload analysis
17. Automated tests
18. Sample game data
19. Database backup and recovery
20. Installation instructions
21. iPhone installation instructions
22. Desktop startup instructions
23. Clear source-code documentation
24. A roadmap for future enhancements

Where possible, create the actual project files and run automated tests.

Do not provide pseudocode in place of functioning implementation.

If the environment has limitations, explain them briefly and deliver the largest working portion possible.

---

# PART XXIV: DESIGN CONSTRAINTS AND FINAL INSTRUCTIONS

## 41. NON-NEGOTIABLE PRIORITIES

The priorities, in order, are:

**1. Usability**

I must be able to score a baseball game on my phone while actually enjoying watching it.

**2. Reliability**

The application must not lose game information because of weak internet service or a temporary interruption.

**3. Accuracy**

Statistics must be calculated correctly from the observations actually entered.

**4. Defensive accountability**

Position-by-position innings, substitutions, opportunities, and errors are essential.

**5. Data ownership**

I must be able to export, back up, restore, and independently analyze my own information.

**6. Analytical value**

The permanent database should support meaningful batting, pitching, defensive, and player-development analysis.

**7. Simplicity of maintenance**

This is a private application for one person, not a commercial software business.

Avoid unnecessary complexity.

## 42. YOUR FIRST ACTIONS

Begin by thoroughly reviewing the provided GameChanger CSV, the application's requirements, and the core baseball scoring workflows.

Then:

1. Recommend the simplest reliable architecture.
2. Identify the most important mobile scoring screens.
3. Define the data model.
4. Design the scoring event engine.
5. Design the defensive assignment and positional innings model.
6. Establish the offline storage and weekend export workflow.
7. Implement the first functional end-to-end version.

Do not get bogged down creating an elaborate enterprise architecture before there is a working mobile scorekeeper.

Use intelligent assumptions where details are not essential.

Ask clarifying questions only when the answer would materially change the architecture, cause data loss, or block implementation.

**THE ULTIMATE OBJECTIVE**

Create a personal baseball analytics system that lets me stop being a coach while retaining the ability to understand what's happening on the field.

I should be able to enjoy watching Eli play baseball, score the game when convenient, and later sit at my computer with a wealth of objective statistics about hitting, pitching, fielding, player development, and defensive opportunities.

The application should make collecting useful baseball information easy enough that I actually use it every weekend.

**Build Dugout Dad as a real, functional application.**