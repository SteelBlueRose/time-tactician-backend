exports.up = pgm => {
  pgm.sql(`
    DROP TABLE IF EXISTS time_slots;
    DROP TABLE IF EXISTS rewards;
    DROP TABLE IF EXISTS task_completions;
    DROP TABLE IF EXISTS habits;
    DROP TABLE IF EXISTS recurrence_patterns;
    DROP TABLE IF EXISTS task_time_slots;
    DROP TABLE IF EXISTS tasks;
    DROP TABLE IF EXISTS users;

    DROP TYPE IF EXISTS slot_type;
    DROP TYPE IF EXISTS reward_state;
    DROP TYPE IF EXISTS day_of_week;
    DROP TYPE IF EXISTS frequency;
    DROP TYPE IF EXISTS task_state;
    DROP TYPE IF EXISTS task_priority;
    
    -- Users Table
    CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        reward_points INTEGER DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- Tasks Table
    CREATE TYPE task_priority AS ENUM ('Low', 'Medium', 'High', 'Critical');
    CREATE TYPE task_state AS ENUM ('Created', 'InProgress', 'Completed', 'Overdue');

    CREATE TABLE tasks (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        parent_task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        priority task_priority NOT NULL,
        state task_state DEFAULT 'Created',
        deadline TIMESTAMP WITH TIME ZONE,
        estimated_time INTEGER, -- in minutes
        reward_points INTEGER,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- Task Time Slots (for scheduling parts of a task)
    CREATE TABLE task_time_slots (
        id SERIAL PRIMARY KEY,
        task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
        start_time TIMESTAMP WITH TIME ZONE NOT NULL,
        end_time TIMESTAMP WITH TIME ZONE NOT NULL
    );

    -- Recurrence Pattern (for Habits and TimeSlots)
    CREATE TYPE frequency AS ENUM ('Daily', 'Custom');
    CREATE TYPE day_of_week AS ENUM ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday');

    CREATE TABLE recurrence_patterns (
        id SERIAL PRIMARY KEY,
        frequency frequency NOT NULL,
        interval INTEGER, -- e.g., every 2 days
        specific_days day_of_week[]
    );

    -- Habits Table (recurring tasks)
    CREATE TABLE habits (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
        recurrence_id INTEGER REFERENCES recurrence_patterns(id),
        streak INTEGER DEFAULT 0,
        last_completed TIMESTAMP WITH TIME ZONE
    );

    -- Task Completions History (for tracking habit consistency)
    CREATE TABLE task_completions (
        id SERIAL PRIMARY KEY,
        task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
        completed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- Rewards Table
    CREATE TYPE reward_state AS ENUM ('Active', 'Completed');

    CREATE TABLE rewards (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        cost INTEGER NOT NULL,
        state reward_state DEFAULT 'Active',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- Time Slots Table (user's availability)
    CREATE TYPE slot_type AS ENUM ('Break', 'WorkingHours');

    CREATE TABLE time_slots (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
        recurrence_id INTEGER REFERENCES recurrence_patterns(id),
        start_time TIMESTAMP WITH TIME ZONE,
        end_time TIMESTAMP WITH TIME ZONE,
        start_minutes INTEGER, -- minutes from midnight
        end_minutes INTEGER,   -- minutes from midnight
        slot_type slot_type NOT NULL
    );
  `);
};

exports.down = pgm => {
  pgm.sql(`
    DROP TABLE IF EXISTS time_slots;
    DROP TABLE IF EXISTS rewards;
    DROP TABLE IF EXISTS task_completions;
    DROP TABLE IF EXISTS habits;
    DROP TABLE IF EXISTS recurrence_patterns;
    DROP TABLE IF EXISTS task_time_slots;
    DROP TABLE IF EXISTS tasks;
    DROP TABLE IF EXISTS users;

    DROP TYPE IF EXISTS slot_type;
    DROP TYPE IF EXISTS reward_state;
    DROP TYPE IF EXISTS day_of_week;
    DROP TYPE IF EXISTS frequency;
    DROP TYPE IF EXISTS task_state;
    DROP TYPE IF EXISTS task_priority;
  `);
};
