# Forge
### Your fitness, nutrition, and recovery in one place.

I created Forge because I wanted a fitness application that brought together the features I actually wanted to use. I was frustrated with platforms that put useful features behind subscriptions or treated workouts, nutrition, and recovery as completely separate things.

I wanted to build something that could look at the bigger picture instead of treating each part of fitness as its own separate problem.

**Try it:** [Forge](https://forge-orcin-delta.vercel.app/)

## What it does

Forge is an AI-powered fitness platform that connects training, nutrition, recovery, and personalized coaching.

Some of its main features include:

- **Personalized workouts:** Generates workouts based on goals, experience, schedule, available equipment, and training history.
- **Workout tracking:** Records sets, reps, weight, effort, and personal records.
- **Progressive overload:** Tracks performance and adjusts future workout targets based on previous results.
- **AI fitness coach:** Uses information from a user's fitness journey to provide personalized guidance and recommendations.
- **Nutrition tracking:** Logs meals and tracks calories and macronutrients.
- **Meal planning:** Generates meal plans using nutrition goals, food preferences, saved recipes, and available ingredients.
- **Recipe management:** Imports, organizes, and scales recipes.
- **Grocery planning:** Turns recipes and meal plans into grocery lists and can account for ingredients already in the pantry.
- **Recovery tracking:** Records sleep, energy, soreness, stress, and workout readiness.
- **Progress analytics:** Tracks strength, body weight, training volume, workout frequency, and personal records.

The main idea is to help answer one question:

**What should I do today to get closer to my goals?**

## How I built it

I built Forge with **React** on the frontend and a **Node.js REST API** on the backend. I used **Supabase and PostgreSQL** to manage application data, including user profiles, workouts, recipes, meal plans, food logs, recovery records, and AI conversations.

I also integrated the **Grok and Gemini APIs** to power the AI coach, workout personalization, meal suggestions, and other natural-language features.

One thing I wanted to be careful about was not using AI for absolutely everything. Important calculations, such as recipe scaling, macro calculations, and workout progression, are handled by application logic rather than relying on an AI-generated answer. This makes those calculations more predictable.

## Challenges I ran into

One of my biggest challenges was keeping the AI features available when an API provider wasn't working as expected.

My initial Grok integration relied on free usage credits, which eventually ran out. Instead of allowing the AI features to stop working, I integrated Gemini and developed a fallback system that can switch providers when one becomes unavailable. I also added logic to switch between Gemini models when one is experiencing high demand.

This was an important lesson for me: connecting an AI API is relatively straightforward, but making an application dependable when external services have limitations is a different challenge.

Another challenge was connecting all the different parts of the application. Workouts, nutrition, recovery, recipes, and grocery planning all need to work together. I wanted the AI coach to have relevant context instead of generating completely disconnected recommendations.

## What I'm proud of

I'm proud of how much Forge brings together in one application. A workout isn't just a workout when your recovery, nutrition, available equipment, and previous performance can all influence what you should do next.

I'm also proud of the AI fallback system. It pushed me to think beyond getting a feature working and consider what happens when something it depends on stops working.

## What I learned

Forge helped me improve my understanding of full-stack development, database design, API integrations, and building applications around external AI services.

I also learned that AI doesn't need to control every part of an application. Sometimes the best approach is combining AI with predictable application logic, using each where it makes the most sense.

## What's next?

There are several features I'd like to continue exploring, including:

- Computer-vision-based workout form analysis.
- More advanced progress analytics.
- Notifications and personalized recommendations.
- Further improvements to AI coaching and personalization.

## Development tools

I designed and developed Forge myself, using Claude and GitHub Copilot as coding assistants. Claude helped generate portions of code, particularly around AI integrations, while GitHub Copilot helped me debug errors.

I made the project decisions and directed the development, using these tools to help me work through unfamiliar concepts and technical challenges.
