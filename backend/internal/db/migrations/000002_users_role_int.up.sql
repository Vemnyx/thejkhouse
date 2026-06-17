ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE users
    ALTER COLUMN role DROP DEFAULT;

ALTER TABLE users
    ALTER COLUMN role TYPE smallint
    USING (
        CASE role
            WHEN 'host' THEN 0
            WHEN 'guest' THEN 1
            ELSE 1
        END
    );

ALTER TABLE users
    ADD CONSTRAINT users_role_check CHECK (role IN (0, 1));

ALTER TABLE users
    ALTER COLUMN role SET DEFAULT 1;
