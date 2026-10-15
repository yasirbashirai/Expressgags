-- Normalize staff and customer emails to lowercase on every insert/update, so sign-in
-- (which lowercases input) always matches no matter which code path created the row.
CREATE OR REPLACE FUNCTION eb_lowercase_email() RETURNS trigger AS $$
BEGIN
  IF NEW.email IS NOT NULL THEN
    NEW.email := lower(trim(NEW.email));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS eb_user_email_lower ON "User";
CREATE TRIGGER eb_user_email_lower BEFORE INSERT OR UPDATE OF email ON "User"
  FOR EACH ROW EXECUTE FUNCTION eb_lowercase_email();

DROP TRIGGER IF EXISTS eb_customer_email_lower ON "Customer";
CREATE TRIGGER eb_customer_email_lower BEFORE INSERT OR UPDATE OF email ON "Customer"
  FOR EACH ROW EXECUTE FUNCTION eb_lowercase_email();

-- Existing rows (no-op when already lowercase)
UPDATE "User" SET email = lower(trim(email)) WHERE email <> lower(trim(email));
UPDATE "Customer" SET email = lower(trim(email)) WHERE email <> lower(trim(email));
