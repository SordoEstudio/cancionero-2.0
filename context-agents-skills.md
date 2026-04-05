A continuación tenés un **paquete de documentos base** para usar con una IA de desarrollo (por ejemplo agentes tipo Cursor, Windsurf, Copilot Workspace, Devin-like pipelines, etc.).
Están diseñados para que el agente entienda:

* contexto del producto
* arquitectura
* estándares
* tareas
* reglas
* contratos de datos

Podés guardarlos en:

```id="0d9w6q"
.ai/
.docs/
.spec/
```

---

# 1. CONTEXT.md

```md id="qwxj98"
# Project Context

## Project name
ChordFlow (working name)

## Purpose
Web application that helps musicians play songs more easily by keeping chords visible throughout the song.

The system imports songs from chord websites and improves readability for playing:

- fills missing chords in repeated sections
- allows tone transposition
- provides auto-scroll for playing
- allows saving modified versions of songs
- provides multiple viewing modes (lyrics-only, chords-only, inline chords)

## Target users

guitar players
musicians learning songs
music teachers
bands rehearsing

## Problem being solved

Chord websites often show chords only once at the beginning of a section.
When scrolling through the song, chords disappear and the musician must scroll back.

This disrupts practice and performance.

## Solution

A structured representation of songs:

sections → lines → chords

The system detects repeated song sections and replicates chord progressions automatically.

## Supported sources

lacuerda.net
cifraclub.com

Future:

ultimate-guitar.com
tabs.ultimate-guitar.com

## Core features

import song from URL
parse chords
detect structure
fill missing chords
transpose key
auto scroll
save user versions
view modes

## Non goals (for MVP)

audio playback
AI chord generation
real-time collaboration
mobile app

## Key technical challenges

HTML scraping differences per site
detect repeated song sections
robust chord parsing
transposition accuracy
maintaining formatting
```

---

# 2. ARCHITECTURE.md

```md id="bg5fkn"
# Architecture

## Stack

frontend:
Next.js (app router)
React
Tailwind

backend:
Next.js server actions

database:
Supabase PostgreSQL

scraping:
axios
cheerio

## System diagram

client
↓
Next.js server routes
↓
scraper
parser
structure detector
transpose engine
↓
Supabase

## Data flow

1 user provides URL
2 server downloads HTML
3 parser extracts chords and lyrics
4 structure detector identifies repeated sections
5 system fills missing chords
6 normalized structure stored in database
7 client renders optimized layout

## Folder structure

app/
 api/
 song/
 components/
 lib/
 db/

lib/
 scraper.ts
 parser.ts
 structure.ts
 transpose.ts

db/
 schema.sql
```

---

# 3. DATABASE_SPEC.md

```md id="ysdjyt"
# Database Specification

## songs

represents original imported song

fields:

id uuid pk
title text
artist text
source_url text
original_key text
created_at timestamp

---

## song_sections

sections of the song

verse
chorus
bridge
intro
outro

fields:

id uuid pk
song_id uuid fk
type text
position int

---

## song_lines

individual lines

fields:

id uuid pk
section_id uuid fk
position int
chord text
text text

---

## song_versions

user modified versions

fields:

id uuid pk
song_id uuid fk
user_id uuid
name text
key text
capo int
created_at timestamp

---

## version_lines

lines modified by user

fields:

id uuid pk
version_id uuid fk
section_position int
line_position int
chord text
text text
```

---

# 4. PARSER_SPEC.md

```md id="yzs2r2"
# Parser Specification

## chord detection regex

[A-G](#|b)?(m|maj|min|sus|dim|aug)?[0-9]*

examples:

C
Am
F#m
Bb
G7
Dsus4

## input format example

C
example lyric line

Am
example lyric line

F
example lyric line

## output format

json structure:

sections[]

section:

type
lines[]

line:

chord
text

## parsing steps

1 split text into lines
2 detect chord lines
3 pair chord line with lyric line
4 detect blank lines → section separation
5 normalize whitespace

## edge cases

lines without chords
multiple chords per line
tabs formatting
extra whitespace
```

---

# 5. STRUCTURE_DETECTION.md

```md id="9nmj7v"
# Structure Detection

Goal:
identify song sections automatically

verse
chorus
bridge

## heuristics

chorus:
most repeated block

verse:
similar blocks appearing between choruses

bridge:
unique block near end of song

## algorithm

split text into blocks using blank lines

normalize blocks:

lowercase
remove punctuation
remove extra whitespace

hash blocks

count occurrences

assign:

highest frequency block → chorus

unique block near end → bridge

others → verse

## similarity threshold

string similarity > 0.85 considered same block

library suggestion:

string-similarity
```

---

# 6. TRANSPOSITION_ENGINE.md

```md id="gfr09j"
# Transposition Engine

## chromatic scale

C
C#
D
D#
E
F
F#
G
G#
A
A#
B

## transpose formula

new_index = (index + steps) mod 12

## supported chords

major
minor
7
maj7
sus2
sus4
dim
aug

## chord parsing

root note
modifier

example:

F#m7

root:
F#

modifier:
m7

## output

preserve modifier

transpose only root
```

---

# 7. API_SPEC.md

```md id="bf3nsh"
# API specification

POST /api/import-song

input:

{
 url
}

output:

{
 id
 title
 artist
 structure
}

---

GET /api/song/:id

returns normalized structure

---

POST /api/save-version

input:

{
 song_id
 key
 capo
 structure
}

---

POST /api/transpose

input:

{
 structure
 steps
}

output:

transposed structure
```

---

# 8. UI_SPEC.md

```md id="v7ybgk"
# UI specification

## pages

home
song editor
song view

---

## components

SongEditor

ChordLine

SectionBlock

ToneSelector

ScrollControl

ViewModeSwitch

---

## view modes

default

C
lyric line

---

inline

[C] lyric line

---

lyrics only

lyric line

---

chords only

C Am F G

---

## scroll control

speed slider

play button

pause button

reset button
```

---

# 9. AGENT_TASKS.md

```md id="ne2mbk"
# Agent Tasks

## phase 1

create Next.js project

configure Supabase connection

implement scraper

---

## phase 2

implement chord parser

implement structure detection

implement normalized json format

---

## phase 3

implement transposition engine

implement inline chord renderer

implement tone selector

---

## phase 4

implement autosave

implement user versions

implement scroll control

---

## phase 5

refactor

optimize performance

add validation
```

---

# 10. CODING_STANDARDS.md

```md id="qg7qsv"
# Coding standards

typescript required

functional components

avoid class components

prefer pure functions

avoid side effects

use server actions when possible

validate inputs

never trust scraped HTML structure

add fallback parsing logic

keep parser independent from UI

keep transposition pure function
```

---

# 11. TEST_CASES.md

```md id="rce64q"
# test cases

## parser

input:

C
line

Am
line

expect:

2 parsed lines

---

## structure detection

input:

verse
chorus
verse
chorus

expect:

chorus detected

---

## transposition

input:

C +2

expect:

D

---

## scrape validation

lacuerda url

returns title
returns lyrics
returns chords
```

---

# 12. FUTURE_AI_INTEGRATION.md

```md id="2w2rjn"
# future AI integration

possible enhancements:

detect chords from lyrics only

suggest capo position

detect song key

suggest easier chord shapes

generate practice loops

detect tempo

align chords with audio
```

---

