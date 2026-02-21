# UI Contract v1 (MVP)

This file defines exactly what the frontend expects from the API.
Do not change field names without updating this file.

---

## DecisionItem

- id: string
- title: string
- version: number
- status: "Final" | "Tentative"
- confidence: number (0-100)
- lastUpdated: string
- explanation: string
- timestamp: string (ISO date string)

---

## ResponsibilityItem

- id: string
- title: string
- owner: string
- due: string
- status: "Open" | "Overdue" | "Completed"
- description: string
- timestamp: string (ISO date string)
