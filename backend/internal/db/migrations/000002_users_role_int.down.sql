ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE users
    ALTER COLUMN role DROP DEFAULT;

ALTER TABLE users
    ALTER COLUMN role TYPE text
    USING (
        CASE role
            WHEN 0 THEN 'host'
            WHEN 1 THEN 'guest'
            ELSE 'guest'
        END
    );

ALTER TABLE users
    ADD CONSTRAINT users_role_check CHECK (role IN ('host', 'guest'));

ALTER TABLE users
    ALTER COLUMN role SET DEFAULT 'guest';
