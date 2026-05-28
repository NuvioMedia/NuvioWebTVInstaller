# Nuvio TV Installer

App per installare, aggiornare, avviare e disinstallare Nuvio TV su:

- 📺 Samsung Smart TV (Tizen)
- 📺 LG Smart TV (webOS)

Il programma scarica automaticamente l’ultima versione da GitHub oppure usa un file locale.

---

# 🚀 COME USARE L’APP

## 1. Avvia il programma
Apri **Nuvio TV Installer**

---

## 2. Scegli la tua TV
- Samsung TV
- LG TV

---

## 3. Inserisci l’IP della TV
Trovi l’IP nelle impostazioni di rete della TV.

---

## 4. Scegli cosa fare
Puoi:

- Installa
- Aggiorna
- Avvia
- Disinstalla

---

## 5. Fine
L’operazione viene eseguita automaticamente via rete.

---

# 📺 SAMSUNG TV (IMPORTANTE)

Prima di usare l’app:

1. Vai su **Apps**
2. Premi `12345` sul telecomando
3. Attiva **Developer Mode**
4. Inserisci l’IP del PC (Host PC IP)
5. Riavvia la TV

---

## Note Samsung
- La TV deve essere in Developer Mode attivo
- Il PC e la TV devono essere sulla stessa rete
- Se l’installazione fallisce, riavvia la TV e riprova

---

# 📺 LG TV (webOS)

## Requisiti

Sul PC deve essere installato:

- LG webOS TV SDK CLI (`ares` tools)

E la TV deve essere in Developer Mode.

---

## Configurazione

1. Registra la TV con:
   ```bash
   ares-setup-device