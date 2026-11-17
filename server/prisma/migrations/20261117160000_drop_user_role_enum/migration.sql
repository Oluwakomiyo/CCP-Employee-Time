-- Access now comes only from User.roleId -> AppRole permissions. The Role enum stays: AppRole.presetOf names
-- which built-in preset a system role starts from.
ALTER TABLE "User" DROP COLUMN "role";
