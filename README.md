# Forge

### AI-powered fitness and nutrition, built around you.

Forge is an AI-powered fitness platform that brings workouts, nutrition, recovery, recipes, grocery planning, and personalized coaching into one experience.

Instead of treating training and nutrition as separate systems, Forge connects them to help answer one simple question:

> **What should I do today to get closer to my goals?**

---

## Overview

Forge combines:

* Personalized workout programming
* Workout tracking and progressive overload
* AI fitness coaching
* Nutrition and food logging
* AI meal planning
* Recipe management and scaling
* Grocery list generation
* Recovery tracking
* Progress analytics
* Personalized recommendations

The goal is to create a single platform that understands the user's goals, history, preferences, and progress.

---

## AI Coach

Forge includes a persistent AI coach that can understand relevant context from the user's fitness journey.

The coach can take into account:

* Fitness goals
* Training history
* Exercise performance
* Sets, reps, weight, and effort
* Personal records
* Recovery
* Available equipment
* Nutrition preferences
* Saved recipes
* Food logs
* Grocery inventory

Rather than generating a completely random workout every day, Forge combines structured training logic with AI-powered personalization.

The AI is primarily responsible for coaching, explanations, personalization, meal suggestions, and natural-language interaction.

---

## Personalized Workouts

Forge generates structured workouts based on the user's:

* Goals
* Experience level
* Schedule
* Workout duration
* Available equipment
* Exercise preferences
* Training history
* Recovery

Each workout can include:

* Exercises
* Sets
* Rep ranges
* Target weight
* Rest periods
* RPE/RIR targets
* Tempo
* Form cues
* Progression strategies

### Progressive Overload

Forge tracks performance over time and adjusts future workouts accordingly.

If a user consistently completes the top of a prescribed rep range with appropriate effort, Forge can increase the target.

If performance remains similar, the target can be maintained.

If performance decreases significantly, the system can adjust the workload.

Supported progression methods include:

* Double progression
* Rep progression
* Weight progression
* Volume progression
* Deloads
* Exercise substitutions

Forge also explains why a recommendation changed.

---

## Fast Workout Logging

Workout tracking is designed to stay out of the way.

Users can quickly record:

* Weight
* Reps
* RPE
* RIR
* Completed sets

Users can also:

* Add sets
* Edit sets
* Delete sets
* Skip exercises
* Replace exercises
* Start rest timers
* Automatically save workout history

---

## Nutrition

Forge combines fitness tracking with nutrition management.

Users can:

* Log meals
* Track calories and macros
* Save recipes
* Organize recipes
* Import recipes
* Scale serving sizes
* Build meal plans
* Generate grocery lists
* Track pantry ingredients

### AI Meal Planning

Forge can create meal plans using factors such as:

* Calories
* Protein
* Carbohydrates
* Fat
* Dietary preferences
* Allergies
* Favorite foods
* Cooking time
* Budget
* Saved recipes
* Available ingredients

Users can also replace individual meals without rebuilding an entire plan.

---

## Recipe Intelligence

Users can import recipe text or supported recipe URLs.

Forge can extract:

* Recipe name
* Ingredients
* Quantities
* Instructions
* Servings
* Preparation time
* Cooking time
* Nutrition information when reliably available

Recipes can also be scaled automatically when the user changes the serving size.

Nutrition values that are estimated are clearly identified as estimates.

---

## Grocery Planning

Forge can automatically turn recipes and meal plans into organized grocery lists.

Grocery items can be grouped by category and users can:

* Check off items
* Add items
* Remove items
* Change quantities
* Share lists

An optional pantry system can also track ingredients the user already owns, allowing Forge to prioritize meals that use existing food.

---

## Recovery

Training doesn't happen in isolation.

Forge can track:

* Sleep duration
* Sleep quality
* Energy
* Muscle soreness
* Stress
* Workout readiness

A quick daily check-in allows Forge to use this information when making future training recommendations.

For example, if recovery is low, the system may reduce training volume rather than blindly following the original plan.

---

## Progress Tracking

Forge provides analytics for:

* Body weight
* Strength
* Training volume
* Reps
* Workout frequency
* Personal records

Users can view trends over time and track estimated 1RM values for exercises such as the bench press, squat, and deadlift.

Estimated values are clearly labeled as estimates.

---

## AI + Deterministic Systems

Forge intentionally does not use AI for everything.

Critical calculations are handled by application logic, including:

* Macro calculations
* Recipe scaling
* Progression calculations
* Workout history
* Database operations
* Authentication
* Permissions

AI is used where it provides the most value:

* Coaching
* Personalization
* Explanations
* Meal suggestions
* Recipe transformations
* Natural-language interaction

This approach keeps important calculations predictable while still providing the flexibility of an AI coach.

---

## Technology

### Frontend

* React
* Mobile-first responsive interface
* Accessible component system

### Backend

* Node.js
* REST API
* Modular service architecture

### Database

* PostgreSQL

### AI

* AI-powered coaching
* Context-aware personalization
* Meal planning
* Recipe transformation

### Security

* Secure authentication
* Password hashing
* Authorization
* Input validation
* Rate limiting
* SQL injection protection
* XSS protection
* Secure API communication
* User-level data isolation

---

## Architecture

```text
React Frontend
      |
      v
Node.js API
      |
      +-- Authentication
      +-- Workout Services
      +-- Nutrition Services
      +-- AI Services
      +-- Progress Services
      |
      v
PostgreSQL
```

The architecture is designed to keep business logic separate from API routes and allow new features to be added without rewriting the application.

---

## Core Data

Forge uses a relational PostgreSQL database with systems for:

* Users and profiles
* Goals
* Training preferences
* Exercise library
* Workout programs
* Workouts
* Sets
* Personal records
* Body measurements
* Recovery logs
* Recipes
* Ingredients
* Meal plans
* Food logs
* Grocery lists
* Pantry inventory
* AI conversations
* User preferences
* Notifications

---

## Product Experience

Forge is organized around a simple navigation system:

**Today · Workout · Nutrition · Recipes · Progress · AI Coach · Profile**

The Today screen acts as the central hub, bringing together:

* Today's workout
* Nutrition
* Hydration
* Recovery
* Progress
* AI recommendations

The goal is to make the next action obvious without overwhelming the user.

---

## Safety

Forge is designed for general fitness and nutrition guidance and is not a replacement for qualified medical professionals.

The system does not:

* Diagnose medical conditions
* Prescribe medical treatment
* Encourage exercising through pain
* Promote crash diets or starvation
* Present computer-vision feedback as medical diagnosis

Safety-sensitive situations should be handled conservatively and users should be directed toward appropriate professional care when necessary.

---

## Roadmap

### Phase 1 — Foundation

Authentication, database, and user profiles.

### Phase 2 — Training

Exercise library, workout creation, logging, and progression.

### Phase 3 — Analytics

Workout history, progress tracking, and personal records.

### Phase 4 — Nutrition

Recipes, food logging, and nutrition tracking.

### Phase 5 — Planning

Meal planning, grocery lists, and pantry management.

### Phase 6 — AI

AI Coach and personalized recommendations.

### Phase 7 — Recovery

Recovery tracking and daily check-ins.

### Phase 8 — Advanced Features

Computer-vision form analysis, notifications, and advanced analytics.

### Phase 9 — Production

Testing, security hardening, performance optimization, and deployment.

---

## Vision

Forge is built around a simple idea:

**Your fitness app should understand the whole picture.**

Your training affects your recovery.

Your recovery affects your training.

Your nutrition supports your goals.

Your history influences what you should do next.

Forge brings those pieces together into one intelligent system.

---

# Forge

**Train smarter. Recover better. Eat with purpose.**

**Build yourself.**
