// Warehouse (#numbers?tab=warehouse), under Operations. The Money page that used to share this route came out on
// 3 November 2026; old links to it go to Accounts (app.js). Its figures are still worked out at view/numbers.
const heading = '<div class="top"><div><h1>Operations</h1><div class="seg rt-tabs"><a href="#activity">Routes</a><a href="#numbers?tab=warehouse" class="on">Warehouse</a></div></div></div>';
export async function render(main) {
  if (!main) return;
  return (await import('/views/storage.js')).render(main, heading);
}
