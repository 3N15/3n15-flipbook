# 3N15 Flipbook

Macht aus einem PDF ein blätterbares 3D-Buch für WordPress. Die Umwandlung läuft im Browser, eingebunden wird per Shortcode `[3n15_flipbook id="123"]`.

## Funktionen

- Seiten lassen sich mit Maus, Finger oder Tastatur umblättern, auch mitten in der Bewegung umkehren
- Eigener WebGL-Renderer, die gegriffene Stelle folgt beim Ziehen dem Zeiger
- Funktioniert auch ohne WebGL, die Seiten liegen zusätzlich als Bilder im HTML
- Kompakte Steuerleiste mit Seitenzahl, Fortschritt und Tooltips
- Seitenübersicht, Vollbild und optionaler PDF-Download
- Bedienung per Tastatur: Pfeiltasten, Bild auf/ab, Pos1, Ende
- Auf schmalen Bildschirmen Einzelseiten mit Wischgeste
- Je Flipbook einstellbar: Akzentfarbe, Breite, Wölbung in vier Stufen, Download, Übersicht

## Backend

- PDF in die Ablagefläche ziehen, per Klick wählen oder aus der Mediathek nehmen
- Fortschritt in Echtzeit mit Vorschau jeder fertigen Seite
- Ein bestehendes Flipbook bleibt online, bis alle neuen Seiten fertig sind
- Titelvorschlag aus dem Dateinamen, zum Übernehmen oder Verwerfen
- Gemischte Seitenformate werden unverzerrt ins Format der ersten Seite eingepasst

## Installation

- ZIP unter Plugins → Installieren → Plugin hochladen einspielen und aktivieren
- Flipbooks → Hinzufügen → PDF wählen
- Shortcode aus der Seitenleiste kopieren und einsetzen

## Changelog

### 0.2.0
- Steuerleiste mit Tooltips und Fortschrittsanzeige
- Wölbung in vier Stufen
- Ablagefläche und Fortschritt in Echtzeit im Backend
- Titelvorschlag aus dem Dateinamen
- Unterstützung für PDFs mit gemischten Seitenformaten
- Verständliche Meldungen bei geschützten oder beschädigten PDFs

### 0.1.0
- Erste Version

## Bekannte Grenzen

- Noch keine Übersetzungsdateien
- Kein Gutenberg-Block, nur Shortcode

## Lizenz

Copyright (C) 2026 3N15.COM

Freie Software unter der GNU General Public License, Version 2 oder später. Nutzen, ändern und weitergeben ist erlaubt, solange dieser Copyright-Vermerk und die Lizenz erhalten bleiben und Änderungen ebenfalls unter der GPL stehen. Volltext in `LICENSE`.

PDF.js steht unter der Apache-Lizenz 2.0 (`licenses/pdfjs-LICENSE.txt`).
