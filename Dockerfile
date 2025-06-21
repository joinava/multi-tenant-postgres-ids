# Use the official PostgreSQL 17 image
FROM postgres:17

# Set environment variables for default user, password, and database
ENV POSTGRES_USER=postgres
ENV POSTGRES_PASSWORD=postgres
ENV POSTGRES_DB=pg_ids_test

# Expose the default PostgreSQL port
EXPOSE 5432

# Optionally, you can add custom SQL scripts to initialize the database
# COPY ./init.sql /docker-entrypoint-initdb.d/

# No CMD needed, as the base image already defines the entrypoint 