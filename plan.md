A continuación tenés el **plan de implementación actualizado** incorporando las decisiones:

* **DB:** Supabase (PostgreSQL)
* **Backend:** serverless con Next.js
* **Scraping:** LaCuerda + CifraClub
* **features clave:** scroll automático, transposición, modo acordes/letra, guardado de versiones

El plan está optimizado para construir un **MVP funcional y escalable**.

---

# 1. Arquitectura final

```id="c3r6t8"
Next.js (App Router)

Server Actions / API Routes

Supabase
 PostgreSQL
 Auth
 Storage (opcional)

Scraper HTML
 Parser musical
 Motor de transposición
 Detector de estructura
```

Deploy:

```id="9d1o8k"
Vercel
Supabase Cloud
```

---

# 2. Stack tecnológico

## frontend

* Next.js 14+
* React
* Tailwind
* Zustand o React Context

---

## backend (serverless)

Next.js:

```id="b9ycf3"
app/api/import-song
app/api/save-version
app/api/get-song
app/api/transpose
```

---

## base de datos

Supabase PostgreSQL

ventajas:

* relaciones claras
* full text search
* versionado eficiente
* auth integrada

---

# 3. modelo de datos SQL

## users

gestionado por Supabase Auth

---

## songs

canción base importada

```sql id="mk8l1p"
create table songs (

 id uuid primary key,

 title text,

 artist text,

 source_url text,

 original_key text,

 created_at timestamp default now()

);
```

---

## song_sections

estructura musical

```sql id="yjqv8l"
create table song_sections (

 id uuid primary key,

 song_id uuid references songs(id),

 type text,

 position int

);
```

type:

```id="kcc5t5"
verse
chorus
bridge
intro
outro
```

---

## song_lines

líneas con acordes

```sql id="d9r6my"
create table song_lines (

 id uuid primary key,

 section_id uuid references song_sections(id),

 position int,

 chord text,

 text text

);
```

---

## song_versions

versiones modificadas por usuario

```sql id="5r6q2y"
create table song_versions (

 id uuid primary key,

 song_id uuid references songs(id),

 user_id uuid,

 name text,

 key text,

 capo int,

 created_at timestamp default now()

);
```

---

## version_lines

líneas modificadas

```sql id="4i6nrb"
create table version_lines (

 id uuid primary key,

 version_id uuid references song_versions(id),

 section_position int,

 line_position int,

 chord text,

 text text

);
```

---

# 4. flujo principal

## importar canción desde URL

usuario pega URL de:

* LaCuerda.net
* Cifra Club

flujo:

```id="r1l5h5"
frontend
 ↓
POST /api/import-song
 ↓
scraper html
 ↓
parser acordes
 ↓
detector estructura
 ↓
guardar en supabase
 ↓
retornar json
```

---

# 5. scraper

## librerías

```id="d0n7kp"
axios
cheerio
```

---

## extracción base

```javascript
const html = await axios.get(url)

const $ = cheerio.load(html.data)

const title = $("h1").text()

const content = $("pre").text()
```

---

# 6. parser musical

transforma texto en:

```json id="99ox8z"
[
 {
  section:"verse",
  lines:[
   {
    chord:"C",
    text:"linea ejemplo"
   }
  ]
 }
]
```

---

# 7. detector de estructura

heurísticas:

## chorus

bloque más repetido

---

## verse

bloques similares

---

## bridge

bloque único cercano al final

---

pipeline:

```id="3j0l97"
split bloques
normalizar texto
detectar repetidos
clasificar secciones
```

---

# 8. completar acordes faltantes

implementado en `lib/parser/chord-carry.ts` y aplicado en `parseSong` después de `classifyAndPairLines`.

algoritmo:

```id="p7tf0m"
1. Recorrer líneas ya parseadas (acordes explícitos emparejados con letra, o letra sola con chords=[]).

2. Mantener plantilla = última línea con al menos un acorde explícito en el scraper,
   más refLen = max(longitud de la letra, alcance visual de los acordes).

3. Cada línea solo-letra con texto: copiar la plantilla remapeando posiciones
   proporcionalmente (position * nuevaLongitud / refLen), ajustando colisiones.

4. El estado de plantilla se conserva entre bloques separados por línea en blanco,
   para estrofas donde LaCuerda no repite la fila de acordes en cada verso.

5. Una nueva fila explícita de acordes reemplaza la plantilla (nuevo compás / sección).
```

límite: si un bloque arranca solo con letra y no hubo acordes antes en la canción, no hay nada que inferir.

---

# 9. motor de transposición

mapa cromático:

```id="uj3uxz"
C C# D D# E F F# G G# A A# B
```

ejemplo:

```id="stj6xf"
transpose("Am", 2)
→ Bm
```

soporta:

```id="2q6i78"
#m
b
maj7
sus4
dim
```

---

# 10. frontend

## pantallas principales

### home

```id="vwh2e5"
input url
historial canciones
```

---

### editor canción

componentes:

```id="l2eyhh"
SongEditor

ChordLine
SectionBlock

ToneSelector

ScrollControl

ViewModeSwitch
```

---

# 11. modos de visualización

## modo normal

```id="s90d3x"
C
Linea texto
```

---

## modo inline

```id="y2qbb4"
[C] linea texto
```

---

## solo acordes

```id="l2xkhq"
C   Am   F   G
```

---

## solo letra

```id="2wd1j1"
linea texto
```

---

# 12. scroll automático

controles:

```id="acdn1n"
velocidad
play
pause
reset
```

implementación:

```javascript
setInterval(scrollStep, speed)
```

---

# 13. guardar versiones

flujo:

```id="mwxpnt"
usuario cambia tono
usuario edita acordes
usuario guarda versión
```

ejemplo:

```id="i5q17o"
Canción original

Versión 1
tono D

Versión 2
tono E capo 2
```

---

# 14. endpoints

## importar canción

```id="a1o2sb"
POST /api/import-song
```

body:

```json id="83oxwg"
{
 url
}
```

---

## obtener canción

```id="u7nypf"
GET /api/song/:id
```

---

## guardar versión

```id="s4xnd6"
POST /api/song-version
```

---

## transponer

```id="v5mnm6"
POST /api/transpose
```

---

# 15. estructura de proyecto

```id="04sj5w"
app

/page.tsx

/song/[id]/page.tsx

/api

/import-song
/song
/version

/lib

scraper.ts
parser.ts
structure-detector.ts
transpose.ts

/components

SongEditor.tsx
ChordLine.tsx
ScrollControl.tsx
ToneSelector.tsx
ViewMode.tsx
```

---

# 16. roadmap de desarrollo

## semana 1

base técnica

* proyecto next
* supabase setup
* scraper funcional
* parser acordes

resultado:

importar canción y visualizar

---

## semana 2

estructura musical

* detectar chorus
* completar acordes
* render secciones

---

## semana 3

UX guitarrista

* transposición
* scroll automático
* modo acordes/letra

---

## semana 4

persistencia

* guardar versiones
* historial usuario

---

# 17. mejoras futuras

## dataset de progresiones

detectar patrones:

```id="yv9j1s"
I V vi IV
```

---

## exportar pdf

formato ensayo.

---

## setlist

ordenar canciones para recital.

---

## metrónomo

tempo por canción.

---

# 18. resultado esperado del MVP

usuario:

1 pega url de canción de LaCuerda.net o Cifra Club
2 la app completa acordes faltantes
3 cambia tono
4 activa scroll automático
5 guarda su versión personalizada

---

Si querés, el próximo paso puede ser:

### esquema SQL completo listo para copiar en Supabase

### diagrama entidad-relación

### contrato JSON del parser

### estructura inicial del repo Next.js
