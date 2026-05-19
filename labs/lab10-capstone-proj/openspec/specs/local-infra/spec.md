# Local Infrastructure Specification

## Purpose

Defines the local development infrastructure: Docker Compose stack for PostgreSQL 16, pgAdmin 4, and Azurite blob emulator with persistent volumes.

## Requirements

### Requirement: Docker Compose local services
The system SHALL provide a `docker-compose.yml` at the repository root that starts PostgreSQL 16, pgAdmin 4, and Azurite (Azure Blob Storage emulator) with a single `docker-compose up -d` command.

#### Scenario: Postgres 16 available
- **WHEN** `docker-compose up -d` completes successfully
- **THEN** PostgreSQL 16 is accessible on port 5432 with credentials matching `.env.example`

#### Scenario: pgAdmin available
- **WHEN** `docker-compose up -d` completes successfully
- **THEN** pgAdmin 4 is accessible at `http://localhost:5050`

#### Scenario: Azurite available
- **WHEN** `docker-compose up -d` completes successfully
- **THEN** Azurite blob service is accessible on port 10000 (blob), 10001 (queue), 10002 (table)

### Requirement: Persistent data volumes
The system SHALL configure named Docker volumes for Postgres data so that database contents survive container restarts.

#### Scenario: Data persists across restarts
- **WHEN** `docker-compose down` is run (without `-v`) and then `docker-compose up -d` is run again
- **THEN** previously created database tables and rows are still present

### Requirement: Local dev connection string compatibility
The Docker Compose Postgres service credentials SHALL match the `DATABASE_URL` value in `.env.example` so developers can copy `.env.example` to `.env` and connect immediately without modification.

#### Scenario: Default credentials work
- **WHEN** a developer copies `.env.example` to `.env` and runs `yarn start:dev`
- **THEN** the NestJS app connects to the Docker Compose Postgres without any credential changes
