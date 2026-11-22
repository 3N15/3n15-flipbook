=== 3N15 Flipbook ===
Tags: flipbook, pdf, 3d
Requires at least: 6.5
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 0.2.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Macht aus einem PDF ein blätterbares 3D-Buch.

== Description ==

* PDF im Backend wählen, die Seiten werden im Browser als WebP erzeugt.
* Einbinden per Shortcode: [3n15_flipbook id="123"]
* Umblättern mit Maus, Finger oder Tastatur, mit eigenem WebGL-Renderer.
* Funktioniert auch ohne WebGL.
* Seitenübersicht, Vollbild und optionaler PDF-Download.

== Installation ==

1. Plugins → Installieren → Plugin hochladen → ZIP wählen → Aktivieren.
2. Flipbooks → Hinzufügen → PDF wählen.
3. Shortcode kopieren und auf einer Seite einsetzen.

== Frequently Asked Questions ==

= Wo liegen die Seitenbilder? =
Im Upload-Ordner unter /wp-content/uploads/3n15-flipbook/. Sie werden entfernt, sobald das Flipbook endgültig gelöscht oder das Plugin gelöscht wird.

== Copyright ==

3N15 Flipbook, Copyright (C) 2026 3N15.COM
Veröffentlicht unter der GPL, Version 2 oder später (siehe LICENSE).

== Third-party ==

* PDF.js 4.10.38 – Apache-2.0 (licenses/pdfjs-LICENSE.txt)

== Changelog ==

= 0.2.0 =
* Steuerleiste mit Tooltips und Fortschrittsanzeige.
* Wölbung in vier Stufen.
* Ablagefläche und Fortschritt in Echtzeit im Backend.
* Titelvorschlag aus dem Dateinamen.
* Unterstützung für PDFs mit gemischten Seitenformaten.

= 0.1.0 =
* Erste Version.
