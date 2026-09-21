# Security Policy

## Unterstützte Versionen

| Version | Unterstützt |
| ------- | ----------- |
| 1.x     | ✅          |
| < 1.0   | ❌          |

nk-tool ist ein Solo-Maintainer-Projekt — es gibt keine parallel gepflegten älteren
Versionszweige. Sicherheitsfixes erscheinen jeweils in der neuesten `1.x`-Version.

## Eine Sicherheitslücke melden

**Bitte keine öffentlichen GitHub Issues für Sicherheitslücken eröffnen.**

Stattdessen über den GitHub-eigenen privaten Meldeweg:
[„Report a vulnerability"](https://github.com/LordAbsalypson/nk-tool/security/advisories/new)
im Security-Tab dieses Repos. Das erstellt eine private Security Advisory, die nur dir und dem
Maintainer sichtbar ist, bis ein Fix veröffentlicht wurde.

Bitte so viele Details wie möglich angeben: betroffene Version, Reproduktionsschritte,
potenzielle Auswirkung.

## Einordnung

nk-tool ist eine **lokal gehostete** Anwendung ohne Cloud-Backend und ohne Datenfluss zum
Autor (siehe [`LEGAL_NOTES.md`](LEGAL_NOTES.md) Abschnitt 1). Das reduziert die Angriffsfläche
gegenüber SaaS-Alternativen strukturell, ersetzt aber keine sorgfältige Handhabung durch den
Betreiber — insbesondere:

- Der optionale Passwortschutz (siehe README) schützt den lokalen Zugriff, nicht die
  Datenübertragung — die App läuft über `http://localhost`, nicht TLS-verschlüsselt.
- Verantwortung für Betriebssystem-Absicherung (Festplattenverschlüsselung, Benutzerkonten)
  liegt beim Betreiber, nicht beim Tool selbst.
