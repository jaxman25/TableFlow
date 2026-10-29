import { createHash, randomBytes, scryptSync } from "node:crypto";
import { pathToFileURL } from "node:url";
import { openDatabase } from "./pglite.mjs";

const PASSWORD = "tableflow123";

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

function hashToken(token) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

const RESTAURANT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_RESTAURANT_ID = "22222222-2222-4222-8222-222222222222";

const staff = [
  { id: "aaaaaaaa-0000-4000-8000-000000000001", email: "owner@tableflow.test", name: "Amina Owner", role: "owner" },
  { id: "aaaaaaaa-0000-4000-8000-000000000002", email: "manager@tableflow.test", name: "Brian Manager", role: "manager" },
  { id: "aaaaaaaa-0000-4000-8000-000000000003", email: "waiter@tableflow.test", name: "Cynthia Waiter", role: "wait_staff" },
  { id: "aaaaaaaa-0000-4000-8000-000000000004", email: "kitchen@tableflow.test", name: "Dennis Kitchen", role: "kitchen" },
  { id: "aaaaaaaa-0000-4000-8000-000000000005", email: "rival@tableflow.test", name: "Eve Rival", role: "owner" },
];

const tables = [1, 2, 3, 4, 5, 6].map((number) => ({
  id: `bbbbbbbb-0000-4000-8000-00000000000${number}`,
  number: String(number),
  token: `devqr-mama-njeris-table-${String(number).padStart(2, "0")}-9f3a2b1c`,
}));

const categories = [
  { id: "cccccccc-0000-4000-8000-000000000001", name: "Breakfast", sort: 1 },
  { id: "cccccccc-0000-4000-8000-000000000002", name: "Mains", sort: 2 },
  { id: "cccccccc-0000-4000-8000-000000000003", name: "Drinks", sort: 3 },
];

const items = [
  { id: "dddddddd-0000-4000-8000-000000000001", category: 1, name: "Mandazi & Chai", price: 25000, description: "Four soft mandazi with a cup of milky chai." },
  { id: "dddddddd-0000-4000-8000-000000000002", category: 1, name: "Chapati Madondo", price: 32000, description: "Two chapati with slow-cooked beans." },
  { id: "dddddddd-0000-4000-8000-000000000003", category: 2, name: "Nyama Choma (500g)", price: 95000, description: "Charcoal-grilled goat served with kachumbari." },
  { id: "dddddddd-0000-4000-8000-000000000004", category: 2, name: "Chicken Biryani", price: 78000, description: "Spiced rice with tender chicken and raita." },
  { id: "dddddddd-0000-4000-8000-000000000005", category: 2, name: "Ugali & Sukuma Wiki", price: 30000, description: "Classic ugali with greens and a side of beef." },
  { id: "dddddddd-0000-4000-8000-000000000006", category: 3, name: "Fresh Passion Juice", price: 18000, description: "Blended passion fruit, lightly sweetened." },
  { id: "dddddddd-0000-4000-8000-000000000007", category: 3, name: "Soda (300ml)", price: 10000, description: "Chilled bottled soda." },
  { id: "dddddddd-0000-4000-8000-000000000008", category: 2, name: "Fish Fillet & Chips", price: 85000, description: "Currently sold out.", available: false },
];

export async function seedDatabase(db) {
  await db.exec("begin");
  try {
    await db.query(
      `insert into public.restaurants (id, name, slug, status, currency)
       values ($1, 'Mama Njeri''s Kitchen', 'mama-njeris', 'active', 'KES')
       on conflict (id) do update set name = excluded.name, status = excluded.status`,
      [RESTAURANT_ID],
    );
    await db.query(
      `insert into public.restaurants (id, name, slug, status, currency)
       values ($1, 'Rival Cafe', 'rival-cafe', 'active', 'KES')
       on conflict (id) do update set name = excluded.name`,
      [OTHER_RESTAURANT_ID],
    );

    const passwordHash = hashPassword(PASSWORD);
    for (const person of staff) {
      await db.query(
        `insert into auth.users (id, email, encrypted_password)
         values ($1, $2, $3)
         on conflict (id) do update set email = excluded.email`,
        [person.id, person.email, passwordHash],
      );
      await db.query(
        `insert into public.profiles (id, display_name)
         values ($1, $2)
         on conflict (id) do update set display_name = excluded.display_name`,
        [person.id, person.name],
      );
      const restaurantId = person.email.startsWith("rival")
        ? OTHER_RESTAURANT_ID
        : RESTAURANT_ID;
      await db.query(
        `insert into public.restaurant_members (restaurant_id, user_id, role, status)
         values ($1, $2, $3, 'active')
         on conflict (restaurant_id, user_id) do update set role = excluded.role, status = 'active'`,
        [restaurantId, person.id, person.role],
      );
    }

    for (const table of tables) {
      await db.query(
        `insert into public.dining_tables (id, restaurant_id, table_number, qr_token_hash, status)
         values ($1, $2, $3, $4, 'active')
         on conflict (id) do update set table_number = excluded.table_number,
           qr_token_hash = excluded.qr_token_hash, status = 'active'`,
        [table.id, RESTAURANT_ID, table.number, hashToken(table.token)],
      );
    }

    for (const category of categories) {
      await db.query(
        `insert into public.categories (id, restaurant_id, name, sort_order)
         values ($1, $2, $3, $4)
         on conflict (id) do update set name = excluded.name, sort_order = excluded.sort_order`,
        [category.id, RESTAURANT_ID, category.name, category.sort],
      );
    }

    for (const [index, item] of items.entries()) {
      await db.query(
        `insert into public.menu_items (
           id, restaurant_id, category_id, name, description, price_minor, is_available, sort_order
         ) values ($1, $2, $3, $4, $5, $6, $7, $8)
         on conflict (id) do update set
           category_id = excluded.category_id,
           name = excluded.name,
           description = excluded.description,
           price_minor = excluded.price_minor,
           is_available = excluded.is_available`,
        [
          item.id,
          RESTAURANT_ID,
          categories.find((category) => category.sort === item.category).id,
          item.name,
          item.description,
          item.price,
          item.available ?? true,
          index,
        ],
      );
    }

    // Fresh sample orders on every seed.
    await db.query(
      "delete from public.order_items where order_id in (select id from public.orders where restaurant_id = $1)",
      [RESTAURANT_ID],
    );
    await db.query("delete from public.order_status_events where restaurant_id = $1", [RESTAURANT_ID]);
    await db.query("delete from public.orders where restaurant_id = $1", [RESTAURANT_ID]);

    const first = await db.query(
      `select ok, error_code from public.place_order($1, $2::jsonb, $3, 'qr', $4)`,
      [
        tables[3].token,
        JSON.stringify([
          { menu_item_id: items[2].id, quantity: 1, notes: "Well done, extra kachumbari" },
          { menu_item_id: items[6].id, quantity: 2 },
        ]),
        "seed-order-table-4-0001",
        "Birthday table, please bring the cake last.",
      ],
    );
    if (!first.rows[0].ok) {
      throw new Error(`sample order failed: ${first.rows[0].error_code}`);
    }

    const second = await db.query(
      `select ok, error_code from public.place_order($1, $2::jsonb, $3, 'tablet', null)`,
      [
        tables[1].token,
        JSON.stringify([{ menu_item_id: items[3].id, quantity: 2 }]),
        "seed-order-table-2-0001",
      ],
    );
    if (!second.rows[0].ok) {
      throw new Error(`sample order failed: ${second.rows[0].error_code}`);
    }

    await db.exec("commit");
  } catch (error) {
    await db.exec("rollback").catch(() => undefined);
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const db = await openDatabase();
  try {
    await seedDatabase(db);
    console.log("[seed] ready");
    console.log(`[seed] staff login: owner@tableflow.test / ${PASSWORD}`);
    console.log(`[seed] table 4 menu: /t/${tables[3].token}`);
  } catch (error) {
    console.error(`[seed] ${error.message}`);
    process.exitCode = 1;
  } finally {
    await db.close();
  }
}
