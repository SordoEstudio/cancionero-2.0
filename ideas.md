A continuación tenés un **paquete completo listo para usar** para la detección de estructura de canciones con acordes y tablaturas.

Incluye:

1. prompt optimizado para LLM
2. lista extensa de edge cases reales
3. test cases con ejemplos inventados
4. formato JSON estándar de salida

Todo orientado a textos tipo lacuerda / cifraclub.

---

# 1. Prompt específico para detectar estructura

## prompt base (producción)

```txt
You are a parser specialized in chord sheets and tablatures.

Your task is to transform raw chord text into structured JSON.

INPUT:
Text containing lyrics, chords, and possibly tablature.

GOALS:
1. detect song structure (intro, verse, chorus, bridge, outro, solo)
2. associate chords with the correct lyric line
3. detect tablatures
4. remove comments or non-musical notes
5. preserve original chord spelling exactly
6. do not invent lyrics or chords
7. reuse harmonic structure when verses repeat
8. normalize spacing

SECTION TYPES:
intro
verse
prechorus
chorus
bridge
solo
outro
instrumental

OUTPUT FORMAT:

{
 title: string|null,
 artist: string|null,
 capo: number|null,
 key: string|null,
 sections: [
   {
     type: "verse|chorus|bridge|intro|outro|solo|instrumental",
     content_type: "lyrics_with_chords|tablature",
     repeat_of: string|null,
     lines: [
       {
         chords: string[],
         lyrics: string
       }
     ],
     tablature: string|null
   }
 ]
}

RULES:

CHORD DETECTION
chords use latin notation:
A B C D E F G
may include:
# b m maj min dim aug sus add
numbers
slash chords

examples:
C#m
F#7
G/B
Aadd9
Bm7b5

TABLATURE DETECTION
tablature consists of 6 lines representing guitar strings:

e|
B|
G|
D|
A|
E|

ignore decorative text

COMMENT REMOVAL
remove lines that contain:
opinions
credits
asterisks
instructions like:
"escuchar la canción"
"correcciones bienvenidas"
"es mi versión"

SECTION DETECTION
infer structure using repetition of chord progressions.

if lyrics repeat with same chords → reuse structure.

do not hallucinate sections not supported by text.

OUTPUT JSON ONLY.
```

---

# 2. lista de edge cases reales

## formato de acordes

### acordes complejos

```
C#m7b5
F#add9
Gsus4
A13
Bbmaj7
E7#9
```

---

### slash chords

```
C/G
D/F#
A/E
```

---

### acordes con paréntesis

```
G (C) G
Am (G/B)
```

---

### acordes repetidos sin letra

```
G D Em C
G D Em C
```

---

## alineación irregular

### acordes encima de palabras

```
G      D
texto inventado
```

---

### acordes inline

```
[G]texto inventado [D]ejemplo
```

---

### mezcla de ambos

```
G
texto [D] inventado
```

---

## estructura implícita

### repetición sin escribir acordes

```
igual que el verso
```

---

### indicaciones informales

```
repite coro
x2
```

---

### bloques duplicados con variaciones pequeñas

ej:

verso 1 y 2 con 1 acorde distinto

---

## tablaturas

### intro tab

```
e|----0---0--
B|----1---1--
G|----0---0--
```

---

### riff corto entre versos

```
G
texto inventado

e|--3--2--0--
```

---

### tab mezclada con acordes

```
G

e|--0--0--|
B|--1--1--|
```

---

## comentarios a eliminar

```
* correcciones bienvenidas
* mi versión acústica
* no estoy seguro del acorde
* suena mejor con capo 2
```

---

## metadata mezclada

```
tono: G
capo 3
afinación: Eb
tempo: 72 bpm
```

---

## idiomas

spanglish

```
chorus
coro
refrain
hook
```

---

## errores comunes en sitios reales

### acordes mal escritos

```
H
C## 
Emm
```

---

### espacios inconsistentes

```
G       D Em
texto inventado
```

---

### acordes al final de línea

```
texto inventado G
```

---

### múltiples espacios

```
G           D
```

---

# 3. formato JSON objetivo

recomendado para DB

```json
{
  "title": "",
  "artist": "",
  "key": "",
  "capo": null,

  "sections": [
    {
      "id": "verse_1",
      "type": "verse",
      "content_type": "lyrics_with_chords",

      "lines": [
        {
          "lyrics": "",
          "chords": []
        }
      ]
    }
  ]
}
```

---

# 4. test cases (ejemplos inventados)

## caso 1 simple

input:

```
G D Em C

texto inventado
otra línea inventada
```

output esperado:

```json
{
 "sections":[
  {
   "type":"verse",
   "lines":[
    {
     "chords":["G","D","Em","C"],
     "lyrics":"texto inventado"
    },
    {
     "chords":["G","D","Em","C"],
     "lyrics":"otra línea inventada"
    }
   ]
  }
 ]
}
```

---

## caso 2 acordes inline

input:

```
[C]texto inventado
[G]otra frase inventada
```

---

## caso 3 repetición implícita

input:

```
G D Em C
línea inventada

igual que el verso
```

output:

verse_2.repeat_of = verse_1

---

## caso 4 tablatura

input:

```
Intro

e|---0---0---
B|---1---1---
G|---0---0---

G D Em C
texto inventado
```

output:

intro.content_type = tablature

---

## caso 5 comentarios mezclados

input:

```
G D Em C
texto inventado

* mi versión acústica
```

output:

comentario eliminado

---

## caso 6 acorde slash

input:

```
C G/B Am F
texto inventado
```

---

## caso 7 puente armónico

input:

```
Am F C G

texto inventado

Dm E7 Am
texto inventado
```

output:

bridge detectado por cambio armónico

---

## caso 8 mezcla inline + alineado

input:

```
G
texto [D] inventado
```

---

## caso 9 repetición parcial

input:

```
G D Em C
línea inventada

G D Em Am
línea inventada 2
```

output:

dos versos distintos

---

## caso 10 múltiples tabs

input:

```
e|--0--
B|--1--

texto inventado

e|--3--
B|--1--
```

output:

dos secciones instrumentales

---

# 5. pipeline recomendado

fase 1
regex preprocessing

fase 2
LLM estructura

fase 3
normalización acordes

fase 4
persistencia

---

