-- License administration states used by admin-managed lifecycle actions.
ALTER TYPE public.license_status ADD VALUE IF NOT EXISTS 'inactive';
ALTER TYPE public.license_status ADD VALUE IF NOT EXISTS 'suspended';
