Aroov: Collaborative Group Travel Planner

A smart travel platform that aligns group schedules, budgets, and interests using algorithmic logic.


Overview

**Aroov** is a full-stack web application designed to solve the logistical chaos of group travel. Unlike standard booking apps, Aroov focuses on the **consensus** phase of planning.

It features a custom **Recommendation Engine** that matches destinations to a group's collective profile and a **Smart Calendar** that calculates the maximum overlap of availability among members.

Built with **JavaScript** on the frontend to demonstrate mastery of DOM manipulation and asynchronous state management, backed by a **Python** server and **TiDB** database.

---

## 📸 Screenshots

| Dashboard & Voting | 
<img width="1904" height="929" alt="image" src="https://github.com/user-attachments/assets/5aa1691d-e348-42c6-9543-d82db51d495c" />
<img width="1891" height="910" alt="image" src="https://github.com/user-attachments/assets/a2723f3c-5bcc-4f9d-ab1e-8263f6e06cef" />
<img width="754" height="510" alt="image" src="https://github.com/user-attachments/assets/6e93575f-fbc7-4931-b047-1a1e7f76921a" />
<img width="1877" height="901" alt="image" src="https://github.com/user-attachments/assets/075d3a5e-969c-4b3b-9454-5092ba885c6f" />

| Calendar View |
<img width="1864" height="894" alt="image" src="https://github.com/user-attachments/assets/726a4661-3463-408a-82f8-7d5aae27bb85" />


---

## ✨ Key Features

### 1. 🗳️ Consensus Engine (Voting System)
- Democratic voting system where members "Heart" destinations.
- Real-time updates of vote counts.
- **Logic:** Aggregates user preferences to rank destinations dynamically.

### 2. 🤖 AI-Driven Recommendations
- Filters destinations based on budget constraints (e.g., RM200 - RM500) and interest tags (e.g., "Nature", "Urban").
- **Algorithm:** Calculates a `% Match Score` for each location against the group's metadata.

### 3. 📅 Interactive Availability Calendar
- Members mark "Busy" dates on a shared visual calendar.
- **Algorithm:** The backend iterates through all member schedules to identify the "Best Time to Travel" (Maximum Overlap).

### 4. ⚡ UX Micro-Interactions
- **Skeleton Screens:** Shimmer effects during data fetching for perceived performance.
- **Staggered Animations:** CSS keyframes animate cards sequentially.
- **Optimistic UI:** Instant button feedback before server confirmation.

---

## 🛠️ Tech Stack

### Frontend
- **Vanilla JavaScript:** Chosen to demonstrate deep understanding of the DOM, Fetch API, and async/await patterns without framework abstraction.
- **HTML5 & CSS3:** Custom Flexbox/Grid layouts and CSS Animations.
- **FullCalendar.js:** For date visualization.

### Backend
- **Python (Flask):** RESTful API architecture.
- **MySQL:** Relational database for Users, Groups, Trips, and Votes.
- **Google Maps API:** Location visualization.

---



