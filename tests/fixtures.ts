import { createHash } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { IDS, TOKENS } from "./test-config";

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export async function seedFixtures(db: PGlite): Promise<void> {
  await db.query(
    `insert into public.restaurants (id, name, slug, status)
     values ($1, 'Restaurant A', 'restaurant-a', 'active'),
            ($2, 'Restaurant B', 'restaurant-b', 'active')`,
    [IDS.restaurantA, IDS.restaurantB],
  );

  const users: [string, string][] = [
    [IDS.ownerA, "owner-a@test.local"],
    [IDS.managerA, "manager-a@test.local"],
    [IDS.waiterA, "waiter-a@test.local"],
    [IDS.kitchenA, "kitchen-a@test.local"],
    [IDS.ownerB, "owner-b@test.local"],
  ];
  for (const [id, email] of users) {
    await db.query(`insert into auth.users (id, email) values ($1, $2)`, [id, email]);
  }

  const memberships: [string, string, string][] = [
    [IDS.restaurantA, IDS.ownerA, "owner"],
    [IDS.restaurantA, IDS.managerA, "manager"],
    [IDS.restaurantA, IDS.waiterA, "wait_staff"],
    [IDS.restaurantA, IDS.kitchenA, "kitchen"],
    [IDS.restaurantB, IDS.ownerB, "owner"],
  ];
  for (const [restaurantId, userId, role] of memberships) {
    await db.query(
      `insert into public.restaurant_members (restaurant_id, user_id, role) values ($1, $2, $3)`,
      [restaurantId, userId, role],
    );
  }

  await db.query(
    `insert into public.dining_tables (id, restaurant_id, table_number, qr_token_hash)
     values ($1, $2, 'T1', $3), ($4, $5, 'T1', $6)`,
    [
      IDS.tableA,
      IDS.restaurantA,
      hashToken(TOKENS.tableA),
      IDS.tableB,
      IDS.restaurantB,
      hashToken(TOKENS.tableB),
    ],
  );

  await db.query(
    `insert into public.categories (id, restaurant_id, name) values ($1, $2, 'Mains')`,
    [IDS.categoryA, IDS.restaurantA],
  );

  await db.query(
    `insert into public.menu_items (id, restaurant_id, category_id, name, price_minor, is_available)
     values ($1, $2, $3, 'Test Pilau', 45000, true),
            ($4, $2, $3, 'Sold Out Stew', 30000, false),
            ($5, $6, null, 'Rival Dish', 99000, true)`,
    [IDS.itemA, IDS.restaurantA, IDS.categoryA, IDS.itemASoldOut, IDS.itemB, IDS.restaurantB],
  );

  await db.query(`select public.place_order($1, $2::jsonb, $3, 'qr', null)`, [
    TOKENS.tableA,
    JSON.stringify([{ menu_item_id: IDS.itemA, quantity: 2 }]),
    "fixture-order-a-0001",
  ]);
  await db.query(`select public.place_order($1, $2::jsonb, $3, 'qr', null)`, [
    TOKENS.tableB,
    JSON.stringify([{ menu_item_id: IDS.itemB, quantity: 1 }]),
    "fixture-order-b-0001",
  ]);
}
