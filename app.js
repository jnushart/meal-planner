const STORAGE = {
  recipes: 'ladle-recipes-v1',
  plan: 'ladle-plan-v1',
  target: 'ladle-target-v1',
  checked: 'ladle-checked-v1',
  email: 'ladle-email-v1',
  cookbooks: 'ladle-cookbooks-v1'
};
const SUPABASE_CONFIG = window.LADLE_SUPABASE_CONFIG || {};
const SUPABASE_URL = String(SUPABASE_CONFIG.url || '');
const SUPABASE_PUBLISHABLE_KEY = String(SUPABASE_CONFIG.publishableKey || '');
const supabaseClient = window.supabase?.createClient && SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY) : null;
const LOCAL_PREVIEW = window.location.protocol === 'file:';
let currentUser = null;
let ownerUserId = '';
let cloudReady = false;
let cloudSyncTimer = 0;
const PDF_PARSER_VERSION = 8;
const VOLUME_ONE_CLEANUP_KEY = 'ladle-remove-magnolia-volume-1-v3';
function isMagnoliaVolumeOneRecipe(recipe) {
  const source = [recipe?.source, recipe?.cookbookName, recipe?.sourceUrl, recipe?.scanFileName].filter(Boolean).join(' ').toLowerCase();
  if (!/magnolia\s+table|table\s+1/.test(source)) return false;
  return !/volume\s*2|vol\.?\s*2|volume\s*3|vol\.?\s*3/.test(source);
}
function removeMagnoliaVolumeOneOnce() {
  if (localStorage.getItem(VOLUME_ONE_CLEANUP_KEY)) return;
  const stored = localStorage.getItem(STORAGE.recipes);
  let existing = [];
  try { existing = stored ? JSON.parse(stored) : []; } catch {}
  if (!Array.isArray(existing)) existing = [];
  const removedIds = new Set(existing.filter(isMagnoliaVolumeOneRecipe).map(recipe => recipe.id));
  if (removedIds.size) {
    localStorage.setItem(STORAGE.recipes, JSON.stringify(existing.filter(recipe => !removedIds.has(recipe.id))));
    const savedPlan = localStorage.getItem(STORAGE.plan);
    if (savedPlan) {
      try {
        const parsedPlan = JSON.parse(savedPlan);
        if (Array.isArray(parsedPlan)) {
          const nextPlan = parsedPlan.map(slot => removedIds.has(slot.recipeId) ? { ...slot, recipeId: null, locked: false } : slot);
          localStorage.setItem(STORAGE.plan, JSON.stringify(nextPlan));
        }
      } catch {}
    }
  }
  localStorage.setItem(VOLUME_ONE_CLEANUP_KEY, 'done');
}
removeMagnoliaVolumeOneOnce();
const REIMPORT_CLEANUP_KEY = 'ladle-reimport-cleanup-v1';
const shouldClearForReimport = !localStorage.getItem(REIMPORT_CLEANUP_KEY);
if (shouldClearForReimport) {
  ['recipes', 'plan', 'target', 'checked'].forEach(key => localStorage.removeItem(STORAGE[key]));
  localStorage.setItem(REIMPORT_CLEANUP_KEY, 'done');
}
const LIBRARY_RESET_FOR_REIMPORT_KEY = 'ladle-clear-library-before-reimport-v2';
const shouldClearLibraryForReimport = !localStorage.getItem(LIBRARY_RESET_FOR_REIMPORT_KEY);
if (shouldClearLibraryForReimport) {
  ['recipes', 'plan', 'target', 'checked'].forEach(key => localStorage.removeItem(STORAGE[key]));
  localStorage.setItem(LIBRARY_RESET_FOR_REIMPORT_KEY, 'done');
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const ACCENTS = ['art-sage', 'art-sun', 'art-rose', 'art-blue', 'art-lilac', 'art-brown', 'art-olive', 'art-coral'];
const seedCookbooks = [
  { id: 'grandma', name: "Grandma's recipes" },
  { id: 'joanna', name: 'Joanna Gaines Cookbook' },
  { id: 'weeknight-atlas', name: 'The Weeknight Atlas' },
  { id: 'green-table', name: 'The Green Table' },
  { id: 'nonna-notebook', name: 'Nonna’s Notebook' }
];

const seedRecipes = [
  { id: 'r1', title: 'Lemon-herb chicken thighs', source: 'The Weeknight Atlas', sourceType: 'cookbook', rating: 5, time: '40 min', accent: 'art-sage', tags: ['chicken', 'cozy'], ingredients: [{ amount: 1.5, unit: 'lb', name: 'chicken thighs', category: 'Proteins' }, { amount: 2, unit: 'tbsp', name: 'olive oil', category: 'Pantry' }, { amount: 1, unit: '', name: 'lemon', category: 'Produce' }, { amount: 3, unit: 'clove', name: 'garlic', category: 'Produce' }, { amount: 1, unit: 'tsp', name: 'dried oregano', category: 'Pantry' }], instructions: ['Pat the chicken dry and season generously with salt and pepper.', 'Sear skin-side down in olive oil until deeply golden.', 'Add lemon, garlic, and oregano; finish in a 425°F oven until cooked through.', 'Rest for 5 minutes and spoon the pan juices over everything.'] },
  { id: 'r2', title: 'Crispy chickpea caesar', source: 'Smitten Kitchen', sourceType: 'internet', rating: 4, time: '25 min', accent: 'art-sun', tags: ['vegetarian', 'salad'], ingredients: [{ amount: 2, unit: 'can', name: 'chickpeas', category: 'Pantry' }, { amount: 1, unit: 'head', name: 'romaine', category: 'Produce' }, { amount: 0.5, unit: 'cup', name: 'parmesan', category: 'Dairy' }, { amount: 2, unit: 'slice', name: 'sourdough', category: 'Bakery' }, { amount: 0.25, unit: 'cup', name: 'caesar dressing', category: 'Pantry' }], instructions: ['Dry the chickpeas well, toss with oil and spices, and roast until crisp.', 'Tear the sourdough into pieces and toast until golden.', 'Chop the romaine and toss with dressing and parmesan.', 'Top with warm chickpeas and crunchy bread.'] },
  { id: 'r3', title: 'Tomato-butter pasta', source: 'A Kitchen in Rome', sourceType: 'cookbook', rating: 5, time: '30 min', accent: 'art-rose', tags: ['pasta', 'quick'], ingredients: [{ amount: 12, unit: 'oz', name: 'spaghetti', category: 'Pantry' }, { amount: 1, unit: 'can', name: 'whole peeled tomatoes', category: 'Pantry' }, { amount: 4, unit: 'tbsp', name: 'butter', category: 'Dairy' }, { amount: 1, unit: '', name: 'yellow onion', category: 'Produce' }, { amount: 0.5, unit: 'cup', name: 'parmesan', category: 'Dairy' }], instructions: ['Simmer the tomatoes, butter, and onion in a wide skillet for 25 minutes.', 'Cook the pasta until just shy of al dente, reserving a mug of pasta water.', 'Toss pasta with sauce, parmesan, and enough pasta water to make it glossy.', 'Remove the onion before serving.'] },
  { id: 'r4', title: 'Miso salmon with rice', source: 'Bon Appétit', sourceType: 'internet', rating: 4, time: '35 min', accent: 'art-blue', tags: ['fish', 'easy'], ingredients: [{ amount: 4, unit: 'oz', name: 'salmon fillets', category: 'Proteins' }, { amount: 2, unit: 'tbsp', name: 'white miso', category: 'Pantry' }, { amount: 1, unit: 'tbsp', name: 'honey', category: 'Pantry' }, { amount: 1, unit: 'cup', name: 'jasmine rice', category: 'Pantry' }, { amount: 1, unit: '', name: 'cucumber', category: 'Produce' }], instructions: ['Whisk miso, honey, and a splash of water into a glaze.', 'Brush over the salmon and roast until just cooked through.', 'Steam the rice and slice the cucumber into thin ribbons.', 'Serve the salmon over rice with cucumber and extra glaze.'] },
  { id: 'r5', title: 'Green chile turkey tacos', source: 'Dinner, Then Dessert', sourceType: 'internet', rating: 3, time: '25 min', accent: 'art-lilac', tags: ['tacos', 'family'], ingredients: [{ amount: 1, unit: 'lb', name: 'ground turkey', category: 'Proteins' }, { amount: 8, unit: '', name: 'corn tortillas', category: 'Bakery' }, { amount: 1, unit: 'can', name: 'diced green chiles', category: 'Pantry' }, { amount: 1, unit: '', name: 'avocado', category: 'Produce' }, { amount: 0.5, unit: 'cup', name: 'cotija cheese', category: 'Dairy' }], instructions: ['Brown the turkey with cumin, salt, and pepper.', 'Stir in the green chiles and cook until saucy.', 'Warm the tortillas in a dry skillet.', 'Fill with turkey, avocado, cotija, and any favorite toppings.'] },
  { id: 'r6', title: 'Roasted vegetable grain bowls', source: 'The Green Table', sourceType: 'cookbook', rating: 4, time: '45 min', accent: 'art-olive', tags: ['vegetarian', 'make-ahead'], ingredients: [{ amount: 1, unit: 'cup', name: 'farro', category: 'Pantry' }, { amount: 2, unit: '', name: 'sweet potatoes', category: 'Produce' }, { amount: 1, unit: 'head', name: 'broccoli', category: 'Produce' }, { amount: 1, unit: 'can', name: 'chickpeas', category: 'Pantry' }, { amount: 0.5, unit: 'cup', name: 'tahini', category: 'Pantry' }], instructions: ['Cook the farro in salted water until pleasantly chewy.', 'Roast sweet potatoes, broccoli, and chickpeas until browned at the edges.', 'Whisk tahini with lemon juice, water, and salt.', 'Build bowls with farro, vegetables, and a generous drizzle of sauce.'] },
  { id: 'r7', title: 'Sunday beef ragu', source: 'Nonna’s Notebook', sourceType: 'cookbook', rating: 5, time: '2 hr 15 min', accent: 'art-brown', tags: ['slow', 'pasta'], ingredients: [{ amount: 1, unit: 'lb', name: 'ground beef', category: 'Proteins' }, { amount: 1, unit: 'can', name: 'crushed tomatoes', category: 'Pantry' }, { amount: 1, unit: '', name: 'carrot', category: 'Produce' }, { amount: 1, unit: '', name: 'celery stalk', category: 'Produce' }, { amount: 1, unit: 'lb', name: 'pappardelle', category: 'Pantry' }], instructions: ['Cook the carrot, celery, and onion in olive oil until soft.', 'Brown the beef until deeply caramelized.', 'Add tomatoes and simmer gently until thick and rich.', 'Toss with pappardelle and finish with parmesan.'] },
  { id: 'r8', title: 'Ginger-lime noodle soup', source: 'A Modern Pantry', sourceType: 'internet', rating: 0, time: '30 min', accent: 'art-coral', tags: ['soup', 'comfort'], ingredients: [{ amount: 4, unit: 'cup', name: 'chicken broth', category: 'Pantry' }, { amount: 8, unit: 'oz', name: 'rice noodles', category: 'Pantry' }, { amount: 1, unit: '', name: 'lime', category: 'Produce' }, { amount: 1, unit: 'in', name: 'fresh ginger', category: 'Produce' }, { amount: 2, unit: '', name: 'eggs', category: 'Dairy' }], instructions: ['Bring the broth to a simmer with ginger and a splash of soy sauce.', 'Cook the noodles directly in the broth until tender.', 'Soft-boil the eggs and halve them.', 'Finish with lime and serve with the eggs on top.'] }
];

const sampleRecipeIds = new Set(seedRecipes.map(recipe => recipe.id));
const storedRecipes = shouldClearForReimport ? [] : load(STORAGE.recipes, seedRecipes);
let recipes = (Array.isArray(storedRecipes) ? storedRecipes : []).filter(recipe => !sampleRecipeIds.has(recipe.id));
const recipesNeedCleanup = Array.isArray(storedRecipes) && storedRecipes.length !== recipes.length;
let plan = load(STORAGE.plan, DAYS.map(day => ({ day, recipeId: null, locked: false })));
let targetMeals = Number(load(STORAGE.target, 5));
let checkedItems = load(STORAGE.checked, {});
let cookbooks = load(STORAGE.cookbooks, seedCookbooks);
let bulkImportDraft = [];
let activeView = 'library';
let toastTimer;
let pendingImportedImage = '';
const recipeImageCache = {};

const $ = (id) => document.getElementById(id);
const escapeHTML = (value = '') => String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[char]));
const save = (key, value) => { localStorage.setItem(key, JSON.stringify(value)); queueCloudSync(key); };
function load(key, fallback) { try { const value = localStorage.getItem(key); return value ? JSON.parse(value) : fallback; } catch { return fallback; } }
if (recipesNeedCleanup) save(STORAGE.recipes, recipes);
function getRecipe(id) { return recipes.find(recipe => recipe.id === id); }
function canManageRecipes() { return LOCAL_PREVIEW || Boolean(currentUser && ownerUserId && currentUser.id === ownerUserId); }
async function refreshOwnerAccess() {
  if (!currentUser || !supabaseClient) return;
  const { data, error } = await supabaseClient.from('app_owners').select('user_id').eq('id', true).maybeSingle();
  if (error) return;
  ownerUserId = data?.user_id || '';
  renderNav();
  renderLibrary();
}
function openRecipeImageDB() {
  if (!window.indexedDB) return Promise.resolve(null);
  if (window.__ladleRecipeImageDB) return window.__ladleRecipeImageDB;
  window.__ladleRecipeImageDB = new Promise(resolve => {
    try {
      const request = indexedDB.open('ladle-recipe-images-v1', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('images', { keyPath: 'id' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
  return window.__ladleRecipeImageDB;
}
async function saveRecipeImage(id, data) {
  if (!data) return false;
  const db = await openRecipeImageDB();
  if (!db) return false;
  return new Promise(resolve => {
    try {
      const transaction = db.transaction('images', 'readwrite');
      transaction.objectStore('images').put({ id, data });
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => resolve(false);
    } catch { resolve(false); }
  });
}
async function hydrateRecipeImages() {
  const db = await openRecipeImageDB();
  if (!db) return;
  await new Promise(resolve => {
    try {
      const request = db.transaction('images', 'readonly').objectStore('images').getAll();
      request.onsuccess = () => {
        request.result.forEach(item => { recipeImageCache[item.id] = item.data; });
        resolve();
      };
      request.onerror = () => resolve();
    } catch { resolve(); }
  });
  render();
}
async function clearRecipeImages() {
  Object.keys(recipeImageCache).forEach(id => delete recipeImageCache[id]);
  const db = await openRecipeImageDB();
  if (!db) return;
  await new Promise(resolve => {
    try {
      const transaction = db.transaction('images', 'readwrite');
      transaction.objectStore('images').clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
    } catch { resolve(); }
  });
}
async function deleteRecipeImage(id) {
  const db = await openRecipeImageDB();
  if (!db) return;
  await new Promise(resolve => {
    try {
      const transaction = db.transaction('images', 'readwrite');
      transaction.objectStore('images').delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
    } catch { resolve(); }
  });
}
function openRecipeSourceDB() {
  if (!window.indexedDB) return Promise.resolve(null);
  if (window.__ladleRecipeSourceDB) return window.__ladleRecipeSourceDB;
  window.__ladleRecipeSourceDB = new Promise(resolve => {
    try {
      const request = indexedDB.open('ladle-recipe-sources-v1', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('sources', { keyPath: 'id' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
  return window.__ladleRecipeSourceDB;
}
async function saveRecipeSource(id, text, descriptor = {}) {
  if (!id || !text) return false;
  const db = await openRecipeSourceDB();
  if (!db) return false;
  return new Promise(resolve => {
    try {
      const transaction = db.transaction('sources', 'readwrite');
      transaction.objectStore('sources').put({
        id,
        text,
        title: descriptor.title || '',
        section: descriptor.section || '',
        pageStart: descriptor.pageStart || 1,
        parserVersion: PDF_PARSER_VERSION
      });
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => resolve(false);
    } catch { resolve(false); }
  });
}
async function hydrateRecipeSources() {
  const db = await openRecipeSourceDB();
  if (!db) return;
  const records = await new Promise(resolve => {
    try {
      const request = db.transaction('sources', 'readonly').objectStore('sources').getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => resolve([]);
    } catch { resolve([]); }
  });
  let changed = false;
  for (const record of records) {
    const recipe = recipes.find(item => item.id === record.id);
    if (!recipe?.sourceTextId || !record.text) continue;
    if (recipe.parserVersion === PDF_PARSER_VERSION && record.parserVersion === PDF_PARSER_VERSION) continue;
    const parsed = parsePDFRecipeText(record.text, {
      title: record.title || recipe.title,
      section: record.section || recipe.section || '',
      pageIndex: Math.max(0, Number(record.pageStart || recipe.sourcePage || 1) - 1)
    });
    if (!parsed.ingredients.length) continue;
    const ingredients = repairStoredIngredientItems(parsed.ingredients, { ...recipe, ...parsed });
    const instructions = parsed.instructions.length ? parsed.instructions : recipe.instructions;
    if (JSON.stringify(ingredients) !== JSON.stringify(recipe.ingredients || []) || JSON.stringify(instructions) !== JSON.stringify(recipe.instructions || []) || recipe.parserVersion !== PDF_PARSER_VERSION) {
      recipe.ingredients = ingredients;
      recipe.instructions = instructions;
      recipe.parserVersion = PDF_PARSER_VERSION;
      changed = true;
    }
  }
  if (changed) save(STORAGE.recipes, recipes);
  render();
}
async function clearRecipeSources() {
  const db = await openRecipeSourceDB();
  if (!db) return;
  await new Promise(resolve => {
    try {
      const transaction = db.transaction('sources', 'readwrite');
      transaction.objectStore('sources').clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
    } catch { resolve(); }
  });
}
async function deleteRecipeSource(id) {
  const db = await openRecipeSourceDB();
  if (!db) return;
  await new Promise(resolve => {
    try {
      const transaction = db.transaction('sources', 'readwrite');
      transaction.objectStore('sources').delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
    } catch { resolve(); }
  });
}
function queueCloudSync(key = '') {
  if (!cloudReady || !currentUser || !supabaseClient) return;
  clearTimeout(cloudSyncTimer);
  cloudSyncTimer = setTimeout(() => syncCloudState(key).catch(() => showToast('Cloud sync is temporarily unavailable.')), 350);
}
function cloudRecipeRow(recipe, userId) {
  const imagePath = recipe.imagePath || (String(recipe.imageUrl || '').startsWith('http') ? recipe.imageUrl : '');
  return {
    id: String(recipe.id),
    user_id: recipe.ownerId || userId,
    title: recipe.title || 'Untitled recipe',
    source: recipe.source || '',
    source_type: recipe.sourceType || 'manual',
    cookbook_id: recipe.cookbookId || '',
    cookbook_name: recipe.cookbookName || '',
    // Ratings live in recipe_ratings, keyed by recipe and user.
    rating: 0,
    prep_time: recipe.time || 'Flexible',
    accent: recipe.accent || 'art-sage',
    tags: Array.isArray(recipe.tags) ? recipe.tags : [],
    ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients : [],
    instructions: Array.isArray(recipe.instructions) ? recipe.instructions : [],
    image_path: imagePath,
    scan_path: recipe.scanPath || '',
    scan_file_name: recipe.scanFileName || '',
    source_url: recipe.sourceUrl || '',
    source_page: Number(recipe.sourcePage) || null,
    source_text_id: recipe.sourceTextId || '',
    parser_version: Number(recipe.parserVersion) || PDF_PARSER_VERSION
  };
}
function recipeFromCloudRow(row, rating = 0) {
  const imagePath = row.image_path || '';
  return {
    id: row.id,
    ownerId: row.user_id || '',
    title: row.title || 'Untitled recipe',
    source: row.source || '',
    sourceType: row.source_type || 'manual',
    cookbookId: row.cookbook_id || '',
    cookbookName: row.cookbook_name || '',
    sourceUrl: row.source_url || '',
    imageUrl: imagePath.startsWith('http') ? imagePath : '',
    imagePath: imagePath.startsWith('http') ? '' : imagePath,
    imageData: '',
    rating: Number(rating) || 0,
    time: row.prep_time || 'Flexible',
    accent: row.accent || 'art-sage',
    tags: Array.isArray(row.tags) ? row.tags : [],
    ingredients: Array.isArray(row.ingredients) ? row.ingredients : [],
    instructions: Array.isArray(row.instructions) ? row.instructions : [],
    scanPath: row.scan_path || '',
    scanData: '',
    scanFileName: row.scan_file_name || '',
    sourcePage: row.source_page || 0,
    sourceTextId: row.source_text_id || '',
    parserVersion: row.parser_version || PDF_PARSER_VERSION
  };
}
async function uploadRecipeAsset(recipe, kind, dataUrl) {
  if (!currentUser || !supabaseClient || !dataUrl || !String(dataUrl).startsWith('data:')) return '';
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const path = `${currentUser.id}/${recipe.id}/${kind}`;
    const { error } = await supabaseClient.storage.from('recipe-assets').upload(path, blob, { upsert: true, contentType: blob.type || 'application/octet-stream' });
    return error ? '' : path;
  } catch { return ''; }
}
async function prepareCloudRecipe(recipe) {
  const next = { ...recipe };
  const imageData = next.imageData || recipeImageCache[next.id] || '';
  if (!next.imagePath && imageData) next.imagePath = await uploadRecipeAsset(next, 'image', imageData);
  if (!next.scanPath && next.scanData) next.scanPath = await uploadRecipeAsset(next, 'scan', next.scanData);
  return next;
}
async function syncRecipesToCloud() {
  if (!currentUser || !supabaseClient) return;
  const ownedRecipes = recipes.filter(recipe => !recipe.ownerId || recipe.ownerId === currentUser.id).map(recipe => {
    if (!recipe.ownerId) recipe.ownerId = currentUser.id;
    return recipe;
  });
  const prepared = [];
  for (const recipe of ownedRecipes) prepared.push(await prepareCloudRecipe(recipe));
  const rows = prepared.map(recipe => cloudRecipeRow(recipe, currentUser.id));
  const { data: existingRows, error: existingError } = await supabaseClient.from('recipes').select('id,user_id').eq('user_id', currentUser.id);
  if (existingError) throw existingError;
  if (rows.length) {
    const { error } = await supabaseClient.from('recipes').upsert(rows, { onConflict: 'id,user_id' });
    if (error) throw error;
  }
  const keepIds = new Set(rows.map(row => row.id));
  const staleIds = (existingRows || []).map(row => row.id).filter(id => !keepIds.has(id));
  if (staleIds.length) {
    const { error } = await supabaseClient.from('recipes').delete().eq('user_id', currentUser.id).in('id', staleIds);
    if (error) throw error;
  }
}
async function syncRecipeRatingsToCloud() {
  if (!currentUser || !supabaseClient) return;
  const rows = recipes
    .filter(recipe => Number(recipe.rating) >= 1 && Number(recipe.rating) <= 5)
    .map(recipe => ({ recipe_id: String(recipe.id), user_id: currentUser.id, rating: Number(recipe.rating), updated_at: new Date().toISOString() }));
  if (!rows.length) return;
  const { error } = await supabaseClient.from('recipe_ratings').upsert(rows, { onConflict: 'recipe_id,user_id' });
  if (error) throw error;
}
async function syncCookbooksToCloud() {
  if (!currentUser || !supabaseClient) return;
  const rows = cookbooks.map(book => ({ id: String(book.id), user_id: currentUser.id, name: book.name || 'Untitled cookbook' }));
  if (rows.length) {
    const { error } = await supabaseClient.from('cookbooks').upsert(rows, { onConflict: 'id,user_id' });
    if (error) throw error;
  }
}
async function syncAppStateToCloud() {
  if (!currentUser || !supabaseClient) return;
  const { error } = await supabaseClient.from('app_state').upsert({ user_id: currentUser.id, plan, target_meals: targetMeals, checked_items: checkedItems, email: load(STORAGE.email, '') }, { onConflict: 'user_id' });
  if (error) throw error;
}
async function syncCloudState() {
  if (!cloudReady || !currentUser || !supabaseClient) return;
  await Promise.all([syncRecipesToCloud(), syncRecipeRatingsToCloud(), syncCookbooksToCloud(), syncAppStateToCloud()]);
}
async function hydrateCloudAssets() {
  if (!supabaseClient) return;
  for (const recipe of recipes) {
    if (recipe.imagePath) {
      const { data } = await supabaseClient.storage.from('recipe-assets').createSignedUrl(recipe.imagePath, 3600);
      if (data?.signedUrl) recipe.imageUrl = data.signedUrl;
    }
    if (recipe.scanPath) {
      const { data } = await supabaseClient.storage.from('recipe-assets').createSignedUrl(recipe.scanPath, 3600);
      if (data?.signedUrl) recipe.scanData = data.signedUrl;
    }
  }
}
async function bootstrapCloud() {
  if (!currentUser || !supabaseClient) return;
  const [{ data: remoteRecipes, error: recipeError }, { data: remoteRatings, error: ratingError }, { data: remoteOwner, error: ownerError }, { data: remoteCookbooks, error: cookbookError }, { data: remoteState, error: stateError }] = await Promise.all([
    supabaseClient.from('recipes').select('*'),
    supabaseClient.from('recipe_ratings').select('recipe_id,rating').eq('user_id', currentUser.id),
    supabaseClient.from('app_owners').select('user_id').eq('id', true).maybeSingle(),
    supabaseClient.from('cookbooks').select('*').eq('user_id', currentUser.id),
    supabaseClient.from('app_state').select('*').eq('user_id', currentUser.id).maybeSingle()
  ]);
  if (recipeError || ratingError || ownerError || cookbookError || stateError) throw recipeError || ratingError || ownerError || cookbookError || stateError;
  ownerUserId = remoteOwner?.user_id || '';
  const ratingMap = new Map((remoteRatings || []).map(row => [String(row.recipe_id), Number(row.rating) || 0]));
  const legacyRatings = [];
  const hasCloudData = (remoteRecipes || []).length > 0 || (remoteCookbooks || []).length > 0 || !!remoteState;
  if (hasCloudData) {
    recipes = (remoteRecipes || []).map(row => {
      const legacyRating = row.user_id === currentUser.id ? Number(row.rating) || 0 : 0;
      const rating = ratingMap.has(String(row.id)) ? ratingMap.get(String(row.id)) : legacyRating;
      if (!ratingMap.has(String(row.id)) && legacyRating) legacyRatings.push({ recipe_id: String(row.id), user_id: currentUser.id, rating: legacyRating, updated_at: new Date().toISOString() });
      return recipeFromCloudRow(row, rating);
    });
    cookbooks = (remoteCookbooks || []).map(book => ({ id: book.id, name: book.name }));
    if (remoteState) {
      plan = Array.isArray(remoteState.plan) ? remoteState.plan : plan;
      targetMeals = Number(remoteState.target_meals) || targetMeals;
      checkedItems = remoteState.checked_items && typeof remoteState.checked_items === 'object' ? remoteState.checked_items : checkedItems;
      if (remoteState.email) localStorage.setItem(STORAGE.email, JSON.stringify(remoteState.email));
    }
    localStorage.setItem(STORAGE.recipes, JSON.stringify(recipes));
    localStorage.setItem(STORAGE.cookbooks, JSON.stringify(cookbooks));
    localStorage.setItem(STORAGE.plan, JSON.stringify(plan));
    localStorage.setItem(STORAGE.target, JSON.stringify(targetMeals));
    localStorage.setItem(STORAGE.checked, JSON.stringify(checkedItems));
    await hydrateCloudAssets();
  } else {
    recipes = recipes.map(recipe => ({ ...recipe, ownerId: recipe.ownerId || currentUser.id }));
    cloudReady = true;
    await syncCloudState();
  }
  cloudReady = true;
  if (legacyRatings.length) {
    const { error } = await supabaseClient.from('recipe_ratings').upsert(legacyRatings, { onConflict: 'recipe_id,user_id' });
    if (error) throw error;
  }
  $('resetDemo').classList.toggle('hidden', !canManageRecipes());
  renderCookbookOptions();
  render();
}
function setAuthVisibility(authenticated) {
  if (LOCAL_PREVIEW) {
    $('authGate').classList.add('hidden');
    $('appShell').classList.remove('hidden');
    return;
  }
  $('authGate').classList.toggle('hidden', authenticated);
  $('appShell').classList.toggle('hidden', !authenticated);
}
async function handleAuthSession(session) {
  currentUser = session?.user || null;
  setAuthVisibility(!!currentUser);
  if (!currentUser) { ownerUserId = ''; return; }
  try {
    await refreshOwnerAccess();
    await hydrateRecipeImages();
    await bootstrapCloud();
  } catch (error) {
    $('authStatus').textContent = `Cloud connection failed: ${error.message || 'Please try again.'}`;
    $('authStatus').classList.add('error');
  }
}
async function requestMagicLink(event) {
  event.preventDefault();
  const email = $('authEmail').value.trim();
  const status = $('authStatus');
  status.classList.remove('error');
  if (!supabaseClient) { status.textContent = 'Cloud login is not available yet.'; status.classList.add('error'); return; }
  status.textContent = 'Sending your sign-in link…';
  const options = window.location.protocol === 'http:' || window.location.protocol === 'https:' ? { emailRedirectTo: window.location.href.split('#')[0] } : undefined;
  const { error } = await supabaseClient.auth.signInWithOtp({ email, options: { ...(options || {}), shouldCreateUser: false } });
  if (error) { status.textContent = error.message; status.classList.add('error'); return; }
  status.textContent = 'Check your email for the secure sign-in link.';
}
async function initializeCloudAuth() {
  if (LOCAL_PREVIEW || !supabaseClient) { setAuthVisibility(false); return; }
  const { data: { session } } = await supabaseClient.auth.getSession();
  await handleAuthSession(session);
  supabaseClient.auth.onAuthStateChange((_event, nextSession) => setTimeout(() => handleAuthSession(nextSession), 0));
}
async function signOutUser() {
  if (supabaseClient && currentUser) await supabaseClient.auth.signOut();
}
function safeImageSource(value, baseUrl = '') {
  if (!value) return '';
  const raw = String(value).trim();
  if (raw.startsWith('data:image/')) return raw;
  try {
    const url = new URL(raw, baseUrl || location.href);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch { return ''; }
}
function recipeImageSource(recipe) {
  return safeImageSource(recipe.imageUrl) || safeImageSource(recipe.imageData) || safeImageSource(recipeImageCache[recipe.id]);
}
function recipeArtwork(recipe, className, pill = '') {
  const image = recipeImageSource(recipe);
  const imageMarkup = image ? `<img src="${escapeHTML(image)}" alt="${escapeHTML(recipe.title || 'Recipe')}" loading="lazy" onerror="this.remove();this.parentElement.classList.remove('has-recipe-image')" />` : '';
  return `<div class="${className} ${recipe.accent || ACCENTS[0]}${image ? ' has-recipe-image' : ''}">${imageMarkup}${pill}</div>`;
}
function isPlannerMealSection(section) { return /^(?:dinner|lunch|main dishes?|mains?)$/i.test(String(section || '').trim()); }
const NON_MEAL_TITLE_PATTERN = /\b(?:appetizers?|starters?|desserts?|cakes?|pies?|cookies?|brownies?|breads?|bagels?|muffins?|donuts?|pancakes?|waffles?|biscotti|biscuits?|smoothies?|juice|dips?|sauces?|jams?|jell(?:y|ies)|preserves?|pickles?|popcorn|candy|brittle|pudding|ice cream|whipped cream|crackers?|chips?|mayo|mayonnaise|dressings?|condiments?|marinades?|vinaigrettes?|aioli|broths?|stocks?)\b/i;
function isPlannerMeal(recipe) {
  if (!recipe) return false;
  const recipeLabel = [recipe.section, recipe.title].filter(Boolean).join(' ');
  if (NON_MEAL_TITLE_PATTERN.test(recipe.title || '')) return false;
  if (/(?:soups?|salads?)/i.test(recipeLabel)) return false;
  if (recipe.mealType === 'meal') return true;
  if (recipe.mealType === 'library-only' || recipe.mealType === 'other') return false;
  const section = recipe.section || (recipe.tags || []).find(tag => /&|dinner|lunch|breakfast|dessert|bread|appetizer|starter|side/i.test(tag));
  if (section) return isPlannerMealSection(section);
  return true;
}
function stars(rating = 0) { return Array.from({ length: 5 }, (_, i) => `<span class="${i < rating ? '' : 'empty'}">★</span>`).join(''); }
function formatAmount(value) { if (value === null || value === undefined || value === '') return ''; if (typeof value === 'string') return value.trim(); const rounded = Math.round(value * 100) / 100; if (rounded === 0.125 || rounded === 0.13) return '⅛'; if (rounded === 0.25) return '¼'; if (rounded === 0.33) return '⅓'; if (rounded === 0.38) return '⅜'; if (rounded === 0.5) return '½'; if (rounded === 0.63) return '⅝'; if (rounded === 0.67) return '⅔'; if (rounded === 0.75) return '¾'; if (rounded === 0.88) return '⅞'; return String(rounded).replace('.5', '½'); }
function normalizeShoppingUnit(unit) {
  const value = String(unit || '').toLowerCase().trim();
  if (/^tsp|teaspoons?$/.test(value)) return 'teaspoons';
  if (/^tbsp|tablespoons?$/.test(value)) return 'tablespoons';
  if (/^cups?$/.test(value)) return 'cups';
  if (/^(?:oz|ounces?)$/.test(value)) return 'ounces';
  if (/^(?:lb|lbs?|pounds?)$/.test(value)) return 'pounds';
  if (/^(?:qt|quarts?)$/.test(value)) return 'quarts';
  if (/^(?:pt|pints?)$/.test(value)) return 'pints';
  if (/^(?:gal|gallons?)$/.test(value)) return 'gallons';
  if (/^packages?$/.test(value)) return 'packages';
  if (/^cloves?$/.test(value)) return 'cloves';
  if (/^slices?$/.test(value)) return 'slices';
  if (/^cans?$/.test(value)) return 'cans';
  if (/^jars?$/.test(value)) return 'jars';
  if (/^packets?$/.test(value)) return 'packets';
  if (/^boxe?s?$/.test(value)) return 'boxes';
  if (/^bage?s?$/.test(value)) return 'bags';
  if (/^pouche?s?$/.test(value)) return 'pouches';
  if (/^containers?$/.test(value)) return 'containers';
  return value;
}
function shoppingUnitLabel(unit, amount) {
  const normalized = normalizeShoppingUnit(unit);
  if (!normalized) return '';
  if (Number(amount) === 1) return normalized.replace(/s$/, '');
  return normalized;
}
const SHOPPING_MEASUREMENTS = {
  teaspoons: { family: 'volume', baseUnit: 'teaspoons', multiplier: 1 },
  tablespoons: { family: 'volume', baseUnit: 'teaspoons', multiplier: 3 },
  cups: { family: 'volume', baseUnit: 'teaspoons', multiplier: 48 },
  pints: { family: 'volume', baseUnit: 'teaspoons', multiplier: 96 },
  quarts: { family: 'volume', baseUnit: 'teaspoons', multiplier: 192 },
  gallons: { family: 'volume', baseUnit: 'teaspoons', multiplier: 768 },
  ounces: { family: 'weight-imperial', baseUnit: 'ounces', multiplier: 1 },
  pounds: { family: 'weight-imperial', baseUnit: 'ounces', multiplier: 16 },
  grams: { family: 'weight-metric', baseUnit: 'grams', multiplier: 1 },
  kilograms: { family: 'weight-metric', baseUnit: 'grams', multiplier: 1000 }
};
function shoppingMeasurement(unit) {
  return SHOPPING_MEASUREMENTS[normalizeShoppingUnit(unit)] || null;
}
function fractionSymbol(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const fraction = Math.round((numeric - Math.floor(numeric)) * 1000) / 1000;
  const match = [[0, ''], [0.125, '⅛'], [0.25, '¼'], [0.333, '⅓'], [0.375, '⅜'], [0.5, '½'], [0.625, '⅝'], [0.667, '⅔'], [0.75, '¾'], [0.875, '⅞']].find(([candidate]) => Math.abs(candidate - fraction) < 0.005);
  return match ? match[1] : null;
}
function mixedAmount(value) {
  const numeric = Math.round(Number(value) * 1000) / 1000;
  if (!Number.isFinite(numeric)) return formatAmount(value);
  const whole = Math.floor(numeric);
  const symbol = fractionSymbol(numeric);
  if (symbol === '') return String(whole);
  if (symbol) return whole ? `${whole}${symbol}` : symbol;
  return formatAmount(numeric);
}
function quantityUnit(value, singular, plural) {
  return Number(value) <= 1 ? singular : plural;
}
function volumeAmountLabel(value) {
  const totalTeaspoons = Math.round(Number(value) * 100) / 100;
  if (!Number.isFinite(totalTeaspoons)) return `${formatAmount(value)} teaspoons`;
  const cups = totalTeaspoons / 48;
  if (cups >= 0.25 && fractionSymbol(cups) !== null) return `${mixedAmount(cups)} ${quantityUnit(cups, 'cup', 'cups')}`;
  let remainder = totalTeaspoons;
  const wholeCups = Math.floor(remainder / 48);
  remainder = Math.round((remainder - wholeCups * 48) * 100) / 100;
  const tablespoons = Math.floor(remainder / 3);
  const teaspoons = Math.round((remainder - tablespoons * 3) * 100) / 100;
  const parts = [];
  if (wholeCups) parts.push(`${wholeCups} ${quantityUnit(wholeCups, 'cup', 'cups')}`);
  if (tablespoons) parts.push(`${formatAmount(tablespoons)} ${quantityUnit(tablespoons, 'tablespoon', 'tablespoons')}`);
  if (teaspoons) parts.push(`${formatAmount(teaspoons)} ${quantityUnit(teaspoons, 'teaspoon', 'teaspoons')}`);
  return parts.join('\n') || '0 teaspoons';
}
function weightAmountLabel(value, family) {
  const total = Math.round(Number(value) * 100) / 100;
  if (!Number.isFinite(total)) return `${formatAmount(value)} ${family === 'weight-metric' ? 'grams' : 'ounces'}`;
  if (family === 'weight-metric') {
    const kilograms = total / 1000;
    if (kilograms >= 1 && fractionSymbol(kilograms) !== null) return `${mixedAmount(kilograms)} ${quantityUnit(kilograms, 'kilogram', 'kilograms')}`;
    return `${formatAmount(total)} ${quantityUnit(total, 'gram', 'grams')}`;
  }
  const pounds = total / 16;
  if (pounds >= 1 && fractionSymbol(pounds) !== null) return `${mixedAmount(pounds)} ${quantityUnit(pounds, 'pound', 'pounds')}`;
  const wholePounds = Math.floor(total / 16);
  const ounces = Math.round((total - wholePounds * 16) * 100) / 100;
  const parts = [];
  if (wholePounds) parts.push(`${wholePounds} ${quantityUnit(wholePounds, 'pound', 'pounds')}`);
  if (ounces) parts.push(`${formatAmount(ounces)} ${quantityUnit(ounces, 'ounce', 'ounces')}`);
  return parts.join('\n') || '0 ounces';
}
function normalizeIngredient(name) {
  let value = String(name || '').toLowerCase().replace(/\s+/g, ' ').trim();
  value = value.replace(/,\s*(?:for garnish|for serving|to taste|as needed|if needed).*$/i, '').trim();
  value = value.replace(/(?:,|\s)\s*(?:plus more|or as needed|and more)\b.*$/i, '').trim();
  value = value.replace(/\s+\d+(?:\.\d+)?$/i, '').trim();
  const semicolonParts = value.split(/\s*;\s*/).map(part => part.trim()).filter(Boolean);
  if (semicolonParts.length > 1) {
    const simplifyPart = part => part
      .replace(/\([^)]*\)/g, ' ')
      .replace(/,\s*(?:melted|softened|cold|cubed|at room temperature|for the baking dish).*$/i, '')
      .replace(/\s+/g, ' ')
      .trim();
    const simplified = semicolonParts.map(simplifyPart);
    if (new Set(simplified).size === 1) value = simplified[0];
    else if (simplified.some(part => /^(?:melted|softened|cold|cubed|for the baking dish)$/i.test(part))) value = simplified.find(part => !/^(?:melted|softened|cold|cubed|for the baking dish)$/i.test(part)) || value;
  }
  value = value.replace(/\s*\([^)]*\)/g, ' ').replace(/^(?:freshly|fresh|bagged|shredded|grated|crumbled|finely shredded|thinly sliced|thickly sliced|roughly chopped|finely chopped|coarsely chopped|chopped|diced|sliced|packed|thawed)\s+/i, '').trim();
  const commaPreparationSuffix = '(?:thinly|thickly|finely|coarsely|roughly|freshly|smashed|grated|shredded|chopped|minced|diced|sliced|cut|cubed|peeled|cored|halved|quartered|trimmed|tied|drained|rinsed|softened|melted|frozen|thawed|packed|reserve|reserved|set aside|divided|each|at room temperature|at room temp|for the [a-z ]+|on a rasp grater)';
  value = value.replace(new RegExp('(?:,|;)\\s*' + commaPreparationSuffix + '\\b.*$', 'i'), '').replace(/\s+(?:at room temperature|at room temp|for the [a-z ]+|on a rasp grater|reserve|reserved|set aside|divided|each)\b.*$/i, '').replace(/\s+/g, ' ').trim();
  value = value.replace(/^freshly (?:ground|cracked) black pepper$/, 'black pepper');
  value = value.replace(/^kosher salt$/, 'salt');
  value = value.replace(/^garlic\s+cloves?$/i, 'garlic');
  value = value.replace(/^(?:extra[- ]virgin|virgin)\s+olive oil$/i, 'olive oil');
  value = value.replace(/^(?:thick\s+)?slices?\s+swiss$/, 'swiss cheese');
  value = value.replace(/^swiss$/, 'swiss cheese');
  value = value.replace(/^phyllo$/, 'phyllo dough');
  return value;
}
function normalizeShoppingIngredient(item) {
  const rawName = String(item?.name || '');
  let name = normalizeIngredient(rawName);
  let unit = normalizeShoppingUnit(item?.unit);
  let amount = item?.amount;
  let measurementFamily = '';
  if (/^(?:lemon|lime|onion|avocado|cucumber|tomato|apple|pear|potato|carrot|egg)s?$/i.test(name)) name = name.replace(/s$/i, '');
  if (!unit && /\bgarlic\s+cloves?\b/i.test(rawName)) {
    name = 'garlic';
    unit = 'cloves';
  }
  const numericAmount = Number(amount);
  const measurement = shoppingMeasurement(unit);
  if (measurement && amount !== '' && amount !== null && amount !== undefined && Number.isFinite(numericAmount)) {
    amount = numericAmount * measurement.multiplier;
    unit = measurement.baseUnit;
    measurementFamily = measurement.family;
  }
  return { ...item, amount, name, unit, measurementFamily };
}
function isSaltPepperOnly(name) {
  const remainder = String(name || '').toLowerCase().replace(/\b(?:kosher|sea|table|fine|coarse|flaky|freshly|ground|cracked|black|salt|pepper|and|or|to|taste|as|needed)\b/g, '').replace(/[^a-z]+/g, '');
  return !remainder;
}
function shouldIncludeShoppingIngredient(item) {
  const name = String(item?.name || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const amount = String(item?.amount ?? '').trim().toLowerCase();
  if (!name) return false;
  if (/(?:prep|cook|cool|marinating|standing|chilling|minutes?|hours?)\b/.test(name)) return false;
  if (/(?:according to package directions|as directed)\b/i.test(name) && !amount) return false;
  if (/(?:for garnish|for serving|for brushing|to taste|as needed|optional)\b/.test(name)) return false;
  if (isSaltPepperOnly(name) && !/[0-9¼½¾⅓⅔⅛⅜⅝⅞]/.test(amount)) return false;
  return true;
}
function showToast(message) { const toast = $('toast'); toast.textContent = message; toast.classList.remove('hidden'); toast.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast.classList.add('hidden'); toast.classList.remove('show'); }, 2600); }
function openModal(id) { $(id).classList.remove('hidden'); document.body.style.overflow = 'hidden'; }
function closeModal(id) { $(id).classList.add('hidden'); document.body.style.overflow = ''; }
function renderCookbookOptions(selectedId = '') {
  const select = $('cookbookSelect');
  if (!select) return;
  select.innerHTML = cookbooks.length ? cookbooks.map(book => `<option value="${book.id}">${escapeHTML(book.name)}</option>`).join('') : '<option value="">Create your first cookbook below</option>';
  if (selectedId && cookbooks.some(book => book.id === selectedId)) select.value = selectedId;
}
function syncImportMode() {
  const mode = $('recipeSourceType').value;
  $('internetImportRow').classList.toggle('hidden', mode !== 'internet');
  $('cookbookImportRow').classList.toggle('hidden', mode !== 'cookbook');
  $('scanUpload').classList.toggle('hidden', mode !== 'cookbook' && !$('recipeScan').files.length);
}
function openRecipeModal(mode = 'manual') {
  $('recipeForm').reset();
  pendingImportedImage = '';
  $('recipeScanName').textContent = 'No file attached';
  $('scanImportStatus').textContent = '';
  $('linkImportStatus').textContent = '';
  renderCookbookOptions();
  $('recipeSourceType').value = mode;
  syncImportMode();
  openModal('recipeModal');
}
function normalizeInstructionValue(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(item => typeof item === 'string' ? [item] : [item?.text || item?.name || '']).filter(Boolean);
  return String(value).split(/\n+/).map(line => line.replace(/^\s*[\d.)-]+\s*/, '').trim()).filter(Boolean);
}
function findRecipeObject(value) {
  if (!value) return null;
  if (Array.isArray(value)) {
    for (const item of value) { const found = findRecipeObject(item); if (found) return found; }
    return null;
  }
  if (typeof value !== 'object') return null;
  const type = value['@type'];
  if ((Array.isArray(type) ? type : [type]).some(item => String(item || '').toLowerCase() === 'recipe')) return value;
  for (const item of Object.values(value)) { const found = findRecipeObject(item); if (found) return found; }
  return null;
}
function firstImageValue(value) {
  if (Array.isArray(value)) {
    for (const item of value) { const found = firstImageValue(item); if (found) return found; }
    return '';
  }
  if (typeof value === 'string') return value.trim();
  if (value && typeof value === 'object') return String(value.url || value.contentUrl || value['@id'] || '').trim();
  return '';
}
function extractPageImage(doc, sourceUrl = '') {
  const selectors = ['meta[property="og:image"]', 'meta[property="og:image:url"]', 'meta[name="twitter:image"]', 'link[rel="image_src"]'];
  for (const selector of selectors) {
    const element = doc.querySelector(selector);
    const value = element?.getAttribute('content') || element?.getAttribute('href') || '';
    const image = safeImageSource(value, sourceUrl);
    if (image) return image;
  }
  return '';
}
function extractRecipeFromHTML(html, sourceUrl = '') {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const scripts = Array.from(doc.querySelectorAll('script[type="application/ld+json"]'));
  for (const script of scripts) {
    try {
      const recipe = findRecipeObject(JSON.parse(script.textContent));
      if (recipe?.name && recipe?.recipeIngredient?.length) {
        const author = typeof recipe.author === 'string' ? recipe.author : recipe.author?.name;
        return { title: recipe.name, source: author || doc.title || 'Imported recipe', ingredients: recipe.recipeIngredient, instructions: normalizeInstructionValue(recipe.recipeInstructions), time: formatDuration(recipe.totalTime || recipe.cookTime || recipe.prepTime), imageUrl: safeImageSource(firstImageValue(recipe.image), sourceUrl) || extractPageImage(doc, sourceUrl) };
      }
    } catch {}
  }
  const pageTitle = doc.querySelector('h1')?.textContent?.replace(/\s+/g, ' ').trim();
  const clone = doc.body?.cloneNode(true);
  clone?.querySelectorAll('script,style,noscript,svg').forEach(node => node.remove());
  const visibleText = clone?.innerText || clone?.textContent || '';
  const fallback = extractRecipeFromText(visibleText);
  if (fallback?.ingredients?.length && fallback?.instructions?.length) {
    return { ...fallback, title: pageTitle || fallback.title, source: doc.title || 'Imported recipe', imageUrl: extractPageImage(doc, sourceUrl) };
  }
  return null;
}
function formatDuration(value) {
  if (!value) return 'Flexible';
  const match = String(value).match(/PT(?:(\d+)H)?(?:(\d+)M)?/i);
  if (!match) return String(value);
  return [match[1] ? `${match[1]} hr` : '', match[2] ? `${match[2]} min` : ''].filter(Boolean).join(' ') || 'Flexible';
}
function ingredientToLine(value) {
  const raw = typeof value === 'string' ? value.trim() : [value?.amount, value?.unit, value?.name || value?.text].filter(Boolean).join(' ').trim();
  const match = raw.match(/^((?:\d+\s+)?\d+\/\d+|[\d.]+|[¼½¾⅓⅔⅛])\s*(tsp|tbsp|tablespoons?|teaspoons?|cups?|oz|ounces?|lb|lbs|pounds?|g|kg|cloves?|cans?|heads?|slices?|large|small|medium)?\s+(.+)$/i);
  return match ? [match[1], match[2] || '', match[3]].join(' | ') : ` | | ${raw}`;
}
function titleFromRecipeURL(url) {
  try {
    const segment = new URL(url).pathname.split('/').filter(Boolean).pop() || '';
    return decodeURIComponent(segment)
      .replace(/-recipe-\d+$/i, '')
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, character => character.toUpperCase())
      .trim();
  } catch {
    return '';
  }
}
function fillImportedRecipe(imported, sourceUrl = '') {
  const title = imported.title?.trim() || titleFromRecipeURL(sourceUrl);
  pendingImportedImage = safeImageSource(imported.imageUrl, sourceUrl);
  if (title) $('recipeTitle').value = title;
  if (imported.source) $('recipeSource').value = imported.source;
  if (imported.time && $('recipeTime')) $('recipeTime').value = imported.time;
  if (imported.ingredients?.length) $('recipeIngredients').value = imported.ingredients.map(ingredientToLine).join('\n');
  if (imported.instructions?.length) $('recipeInstructions').value = imported.instructions.join('\n');
}
async function importRecipeFromLink() {
  const url = $('recipeUrl').value.trim();
  if (!url) { $('linkImportStatus').textContent = 'Paste a recipe URL first.'; return; }
  $('linkImportStatus').textContent = 'Reading the recipe page…';
  try {
    const imported = extractRecipeFromHTML(await fetchRecipeHTML(url), url);
    if (!imported) throw new Error('No structured recipe found');
    fillImportedRecipe(imported, url);
    $('linkImportStatus').textContent = 'Recipe found — check the fields, then save it.';
  } catch {
    $('linkImportStatus').textContent = 'Automatic reading needs the included local server. Start server.py, then try again.';
  }
}
async function fetchRecipeHTML(url) {
  const encodedUrl = encodeURIComponent(url);
  const endpoints = location.protocol === 'file:' ? [`http://127.0.0.1:8000/api/import?url=${encodedUrl}`, url] : [`/api/import?url=${encodedUrl}`, url];
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, { mode: 'cors', headers: { Accept: 'text/html,application/json' } });
      if (!response.ok) continue;
      if (endpoint.includes('/api/import')) {
        const payload = await response.json();
        if (payload.html) return payload.html;
      } else {
        return await response.text();
      }
    } catch {}
  }
  throw new Error('Recipe page unavailable');
}
function extractRecipeFromText(text) {
  const lines = String(text || '').split(/\n+/).map(line => line.replace(/^\s*[-*•>#]+\s*/, '').replace(/\s+/g, ' ').trim()).filter(line => line.length > 1);
  if (!lines.length) return null;
  const ingredientIndex = lines.findIndex(line => /^(ingredients?|you('ll| will) need|what you need)\s*:?\s*$/i.test(line));
  const instructionIndex = lines.findIndex(line => /^(instructions?|directions?|method|preparation)\s*:?\s*$/i.test(line));
  const title = lines.find(line => !/^(ingredients?|instructions?|directions?|method|preparation|allrecipes)$/i.test(line) && !/^https?:/i.test(line)) || 'Scanned recipe';
  const ingredientsStart = ingredientIndex >= 0 ? ingredientIndex + 1 : 1;
  const ingredientsEnd = instructionIndex > ingredientsStart ? instructionIndex : Math.min(lines.length, ingredientsStart + 18);
  const ingredients = lines.slice(ingredientsStart, ingredientsEnd).filter(line => !/^(notes?|for serving|topping|optional|original recipe|servings?|yield)$/i.test(line)).map(ingredientToLine);
  const instructionLines = instructionIndex >= 0 ? lines.slice(instructionIndex + 1) : lines.slice(ingredientsEnd);
  const instructionEnd = instructionLines.findIndex(line => /^(nutrition facts?|did you make this recipe|save|rate|photos?|recipe developed by|you('ll| will) also love)/i.test(line));
  const instructions = instructionLines.slice(0, instructionEnd >= 0 ? instructionEnd : 12).map(line => line.replace(/^\s*[\d.)-]+\s*/, '').trim()).filter(Boolean);
  return { title, ingredients, instructions, source: 'Cookbook scan', time: 'Flexible' };
}
async function loadTesseract() {
  if (window.Tesseract) return window.Tesseract;
  if (window.__ladleTesseractPromise) return window.__ladleTesseractPromise;
  window.__ladleTesseractPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    script.onload = () => resolve(window.Tesseract);
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return window.__ladleTesseractPromise;
}
async function readCookbookScan() {
  const file = $('recipeScan').files[0];
  if (!file) { $('scanImportStatus').textContent = 'Choose an image scan first.'; return; }
  if (file.type === 'application/pdf') { $('scanImportStatus').textContent = 'PDF attached. For automatic reading, choose a photo or image of the recipe page.'; return; }
  $('scanImportStatus').textContent = 'Reading the scan privately in this browser…';
  try {
    const ocr = await loadTesseract();
    const result = await ocr.recognize(file, 'eng');
    const imported = extractRecipeFromText(result.data.text);
    if (!imported) throw new Error('No recipe text found');
    fillImportedRecipe(imported);
    $('scanImportStatus').textContent = 'Scan read — check the fields, then save it.';
  } catch {
    $('scanImportStatus').textContent = 'I could not read that scan. You can still attach it and type in the fields below.';
  }
}

function loadPDFJS() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (window.__ladlePDFJSPromise) return window.__ladlePDFJSPromise;
  window.__ladlePDFJSPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.onload = () => resolve(window.pdfjsLib);
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return window.__ladlePDFJSPromise;
}

async function pdfOutlinePage(pdf, item) {
  let destination = item.dest;
  if (typeof destination === 'string') destination = await pdf.getDestination(destination);
  if (!Array.isArray(destination) || destination[0] === undefined) return null;
  try { return typeof destination[0] === 'number' ? destination[0] : await pdf.getPageIndex(destination[0]); } catch { return null; }
}

async function collectPDFRecipeOutline(pdf, items, section = '', found = []) {
  for (const item of items || []) {
    const children = item.items || [];
    if (children.length) {
      await collectPDFRecipeOutline(pdf, children, section || item.title || '', found);
      continue;
    }
    if (!section || !item.title) continue;
    const pageIndex = await pdfOutlinePage(pdf, item);
    if (Number.isInteger(pageIndex)) found.push({ title: item.title.trim(), section, pageIndex });
  }
  return found;
}

async function pdfPageToText(page) {
  const content = await page.getTextContent();
  const rows = [];
  content.items.forEach(item => {
    const text = String(item.str || '').trim();
    if (!text) return;
    const x = Number(item.transform?.[4] || 0);
    const y = Number(item.transform?.[5] || 0);
    let row = rows.find(candidate => Math.abs(candidate.y - y) < 3);
    if (!row) { row = { y, items: [] }; rows.push(row); }
    row.items.push({ x, text });
  });
  return rows
    .sort((a, b) => b.y - a.y)
    .map(row => row.items.sort((a, b) => a.x - b.x).map(item => item.text).join(' ').replace(/[–—−]/g, '-').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}
function pdfImageToDataURL(image, maxWidth = 360) {
  if (!image?.data || !image.width || !image.height) return '';
  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = image.width;
  sourceCanvas.height = image.height;
  const sourceContext = sourceCanvas.getContext('2d', { alpha: false });
  let rgba;
  if (image.data.length === image.width * image.height * 4) {
    rgba = image.data;
  } else if (image.data.length === image.width * image.height * 3) {
    rgba = new Uint8ClampedArray(image.width * image.height * 4);
    for (let sourceIndex = 0, targetIndex = 0; sourceIndex < image.data.length; sourceIndex += 3, targetIndex += 4) {
      rgba[targetIndex] = image.data[sourceIndex];
      rgba[targetIndex + 1] = image.data[sourceIndex + 1];
      rgba[targetIndex + 2] = image.data[sourceIndex + 2];
      rgba[targetIndex + 3] = 255;
    }
  } else {
    return '';
  }
  sourceContext.putImageData(new ImageData(rgba, image.width, image.height), 0, 0);
  const scale = Math.min(1, maxWidth / image.width);
  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = Math.max(1, Math.ceil(image.width * scale));
  outputCanvas.height = Math.max(1, Math.ceil(image.height * scale));
  outputCanvas.getContext('2d', { alpha: false }).drawImage(sourceCanvas, 0, 0, outputCanvas.width, outputCanvas.height);
  const dataUrl = outputCanvas.toDataURL('image/jpeg', 0.68);
  sourceCanvas.width = 1;
  sourceCanvas.height = 1;
  outputCanvas.width = 1;
  outputCanvas.height = 1;
  return dataUrl;
}
async function pdfPageHasEmbeddedImage(page) {
  const pdfjs = window.pdfjsLib;
  if (!pdfjs?.OPS) return false;
  try {
    const operatorList = await page.getOperatorList();
    return operatorList.fnArray.some(fn => fn === pdfjs.OPS.paintImageXObject || fn === pdfjs.OPS.paintJpegXObject);
  } catch {}
  return false;
}

async function pdfPageToImage(page, maxWidth = 360) {
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = Math.min(1, maxWidth / baseViewport.width);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(viewport.width));
  canvas.height = Math.max(1, Math.ceil(viewport.height));
  const context = canvas.getContext('2d', { alpha: false });
  await page.render({ canvasContext: context, viewport }).promise;
  const image = canvas.toDataURL('image/jpeg', 0.52);
  canvas.width = 1;
  canvas.height = 1;
  return image;
}

const PDF_FRACTIONS = '¼½¾⅓⅔⅛⅜⅝⅞';
const PDF_WORD_AMOUNT = '(?:one|a|an|two|three|four|five|six|seven|eight|nine|ten)';
const PDF_NUMBER_PATTERN = '(?:\\d+(?:\\.\\d+)?(?:\\s+\\d+\\/\\d+|\\s*[' + PDF_FRACTIONS + '])?|\\d+\\/\\d+|[' + PDF_FRACTIONS + '])(?:st|nd|rd|th)?';
const PDF_INGREDIENT_START = new RegExp('(?:^|\\s)(?:' + PDF_WORD_AMOUNT + '\\s+)?' + PDF_NUMBER_PATTERN + '(?:\\s*-\\s*)?(?=\\s*[a-z][a-z-]*(?:\\s+[a-z][a-z-]*){0,2})', 'gi');
const PDF_AMOUNT_PATTERN = '(?:' + PDF_WORD_AMOUNT + '\\s+)?' + PDF_NUMBER_PATTERN + '(?:\\s+(?:to|-)\\s+' + PDF_NUMBER_PATTERN + ')?';
const PDF_UNIT_PATTERN = '(?:teaspoons?|tsp|tablespoons?|tbsp|cups?|ounces?|oz|pounds?|lbs?|lb|grams?|g|kilograms?|kg|quarts?|qt|pints?|pt|gallons?|gal|cloves?|cans?|heads?|slices?|large|small|medium|loaves?|loaf|packages?|package|packets?|packet|pouches?|pouch|bags?|bag|boxes?|box|containers?|container|jars?|jar|tortillas?|stalks?|sprigs?|sticks?|pieces?|fillets?|bunch|balls?|rounds?|pans?|dozen)';
const PDF_UNMEASURED_MARKER = /\b(?:all-purpose flour,? for the work surface|kosher salt|freshly (?:ground|cracked) black pepper|pinch(?:es)?\s+of|juice of|(?:finely )?grated zest (?:and juice )?of|seeds from|fresh parsley leaves,? for garnish|chopped fresh parsley or sliced green onions,? for garnish|toasted pepitas \(optional\)|hot fudge sauce|vegetable oil spray|nonstick (?:baking|cooking) spray|(?:baking|cooking) spray|flaky salt|thyme sprigs|lemon wedges|parsley,? for garnish|minced fresh parsley|bagel crisps or crackers|candy and\/or sprinkles|canned [a-z][a-z-]*(?:\s+[a-z][a-z-]*){0,2}|rolls?)\b/i;
function singularPDFUnit(value) {
  return String(value || '').toLowerCase().trim()
    .replace(/boxes$/i, 'box')
    .replace(/pouches$/i, 'pouch')
    .replace(/bags$/i, 'bag')
    .replace(/jars$/i, 'jar')
    .replace(/cans$/i, 'can')
    .replace(/packages$/i, 'package')
    .replace(/packets$/i, 'packet')
    .replace(/containers$/i, 'container')
    .replace(/s$/i, '');
}

function pdfParensDepth(value) {
  return (String(value).match(/\(/g) || []).length - (String(value).match(/\)/g) || []).length;
}

function findPDFIngredientStarts(line) {
  const starts = [];
  const value = String(line || '');
  for (const match of value.matchAll(PDF_INGREDIENT_START)) {
    const start = match.index + (match[0].startsWith(' ') ? 1 : 0);
    const prefix = value.slice(0, start);
    if (/(?:\bto|-)\s*$/i.test(prefix) || /\b(?:into|about|approximately|cut|chopped into|pieces? of)\s*$/i.test(prefix)) continue;
    if (/^(?:(?:one|a|an)\s+)?(?:\d+(?:\.\d+)?|[¼½¾⅓⅔⅛⅜⅝⅞])\s*-?\s*inches?\b/i.test(value.slice(start)) && /\b(?:cut into|sliced|chopped into|diced into|batons?|strips?|pieces?)\b/i.test(prefix)) continue;
    if (pdfParensDepth(value.slice(0, start)) <= 0) starts.push(start);
  }
  return starts;
}
function isPDFHeadingLike(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return /^[A-Z][A-Za-z'’&-]*(?:\s+[A-Z][A-Za-z'’&-]*){1,5}$/.test(text);
}

function splitPDFUnmeasuredLine(value) {
  const text = String(value || '');
  const matches = [...text.matchAll(new RegExp(PDF_UNMEASURED_MARKER.source, 'gi'))];
  const cuts = matches
    .map(match => match.index)
    .filter(index => index > 0 && !new RegExp('(?:' + PDF_AMOUNT_PATTERN + ')\\s+' + PDF_UNIT_PATTERN + '\\s*$', 'i').test(text.slice(0, index)));
  if (!cuts.length) return [value];
  const points = [0, ...cuts, text.length];
  return points.slice(0, -1).map((start, index) => text.slice(start, points[index + 1]).trim()).filter(Boolean);
}

function appendPDFPrefix(parts, prefix) {
  const value = String(prefix || '').trim();
  if (!value) return;
  if (/^(?:plus|and|or)$/i.test(value)) {
    parts.push(value);
    return;
  }
  if (isPDFHeadingLike(value)) return;
  if (/^note\)?\s*:?$/i.test(value) && parts.length && /\bsee$/i.test(parts[parts.length - 1])) {
    parts[parts.length - 1] = `${parts[parts.length - 1]} ${value}`.replace(/\s+/g, ' ').trim();
    return;
  }
  if (/^(?:note|tip|ingredients?|prep|cook|cool)\)?\s*:?$/i.test(value)) return;
  if (parts.length && (/^[a-z]/.test(value) || /^(?:note|tip|see note)\)?/i.test(value) || /(?:,|plus|or|and|from|with|at|of|from\s+\w+)$/i.test(parts[parts.length - 1]))) {
    parts[parts.length - 1] = `${parts[parts.length - 1]} ${value}`.replace(/\s+/g, ' ').trim();
    return;
  }
  parts.push(value);
}

function splitPDFIngredientBlock(lines) {
  const parts = [];
  const normalizedLines = [];
  for (const line of lines) {
    const value = String(line || '').replace(/\s+/g, ' ').trim();
    if (!value) continue;
    const previousLine = normalizedLines[normalizedLines.length - 1] || '';
    const endsWithBareAmount = /(?:^|\s)(?:(?:one|a|an|two|three|four|five|six|seven|eight|nine|ten)\s+)?(?:\d+(?:\.\d+)?(?:\s*[¼½¾⅓⅔⅛⅜⅝⅞])?|[¼½¾⅓⅔⅛⅜⅝⅞])$/i.test(previousLine) || /-\s*$/.test(previousLine);
    const startsWithUnit = new RegExp('^' + PDF_UNIT_PATTERN + '\\b', 'i').test(value);
    const endsWithAmountUnit = previousLine && new RegExp('(?:' + PDF_AMOUNT_PATTERN + ')\\s+' + PDF_UNIT_PATTERN + '\\s*$', 'i').test(previousLine);
    const startsWithAmountJoin = /^(?:plus|and)\\s+(?:(?:one|a|an|two|three|four|five|six|seven|eight|nine|ten)\\s+)?(?:\\d+(?:\\.\\d+)?|[¼½¾⅓⅔⅛⅜⅝⅞])/i.test(value);
    const startsWithContinuation = /^(?:[a-z]|\)|\(|plus\b|and\b)/.test(value);
    const startsWithAmount = /^(?:(?:one|a|an|two|three|four|five|six|seven|eight|nine|ten)\s+)?(?:\d+(?:\.\d+)?|[¼½¾⅓⅔⅛⅜⅝⅞])/i.test(value);
    const endsWithStructuralContinuation = /(?:about|approximately|from|of|or|and|into|cut|,|\(|-)\s*$/i.test(previousLine);
    const endsWithDescriptorContinuation = /(?:minced|chopped|sliced|diced|grated|shredded|packed|fresh|dried|ground|cracked|thickly|thick|frozen|baby|young|flat-leaf|long-grain|short-grain|all-purpose|juice|zest|seeds|pickled)\s*$/i.test(previousLine);
    const endsWithCapitalizedContinuation = /(?:sharp|Monterey|Homemade|Poached|Chicken|Roma|Rice|Cheddar|Gruyère|Gruyere|Jack|Parmesan|Mozzarella|Velveeta|Homestyle)\s*$/.test(previousLine);
    const startsWithCapitalizedContinuation = /^[A-Z][A-Za-z'’&-]*(?:\s|$)/.test(value);
    const previousHasIngredientStart = normalizedLines.some(line => findPDFIngredientStarts(line).length > 0);
    if (previousLine && ((endsWithBareAmount && startsWithUnit) || (endsWithAmountUnit && startsWithAmountJoin) || (endsWithStructuralContinuation && (startsWithContinuation || startsWithAmount)) || (endsWithDescriptorContinuation && startsWithContinuation) || (previousHasIngredientStart && endsWithCapitalizedContinuation && startsWithCapitalizedContinuation && !startsWithAmount))) normalizedLines[normalizedLines.length - 1] = `${previousLine} ${value}`;
    else normalizedLines.push(value);
  }
  for (const value of normalizedLines) {
    const timingOnly = /^(?:prep|cook|cool)\s*:?\s*(?:none|\d+(?:\s+to\s+\d+)?\s*(?:minutes?|hours?|days?|weeks?))?$/i.test(value) || /^(?:none|\d+(?:\s+to\s+\d+)?)\s*(?:minutes?|hours?|days?|weeks?)$/i.test(value);
    if (timingOnly) continue;
    if (parts.length && /^(?:\d+(?:\.\d+)?|[¼½¾⅓⅔⅛⅜⅝⅞])\s*-\s*inch\b/i.test(value)) {
      parts[parts.length - 1] = `${parts[parts.length - 1]} ${value}`.replace(/\s+/g, ' ').trim();
      continue;
    }
    for (const fragment of splitPDFUnmeasuredLine(value)) {
      const starts = findPDFIngredientStarts(fragment);
      if (starts.length) {
        appendPDFPrefix(parts, fragment.slice(0, starts[0]));
        starts.forEach((start, index) => {
          const part = fragment.slice(start, starts[index + 1] || fragment.length).trim();
          if (part && !/^(?:none|\d+(?:\s+to\s+\d+)?)\s*(?:minutes?|hours?|days?|weeks?)\b/i.test(part)) parts.push(part);
        });
      } else {
        const previousPart = parts[parts.length - 1] || '';
        const continuationOnly = /^(dough|filling|topping|sauce|tartar sauce|ingredients?)$/i.test(fragment);
        const incompletePrevious = /(?:\b(?:minced|chopped|sliced|diced|grated|shredded|packed|fresh|dried|ground|cracked|thickly|thick|deli|baby|young|flat-leaf|long-grain|short-grain|all-purpose|from|of|plus|or|and|into|cut))$/i.test(previousPart);
        const standaloneUnmeasured = /^(?:kosher salt|freshly (?:ground|cracked) black pepper|juice of|(?:finely )?grated zest|seeds from|flaky salt|thyme sprigs|lemon wedges|parsley|fresh parsley|minced fresh parsley|cooking spray|vegetable oil spray|nonstick .* spray|toasted pepitas|hot fudge sauce)\b/i.test(fragment);
        if (isPDFHeadingLike(fragment) && !PDF_UNMEASURED_MARKER.test(fragment) && !/(?:or|and|from|with|of|,)\s*$/i.test(previousPart)) {
          continue;
        } else if (standaloneUnmeasured) {
          parts.push(fragment);
        } else if (parts.length && (continuationOnly || /^[a-z]/.test(fragment) || /^(?:and|or|from|with|at)\b/i.test(fragment) || incompletePrevious || /(?:,|plus|or|and|from|with|at|of|from\s+\w+)$/i.test(previousPart))) {
          parts[parts.length - 1] = `${parts[parts.length - 1]} ${fragment}`.replace(/\s+/g, ' ').trim();
        } else if (!continuationOnly) {
          parts.push(fragment);
        }
      }
    }
  }
  return parts;
}

function parsePDFAmount(value) {
  const raw = String(value || '').trim().toLowerCase().replace(/[–—−]/g, '-').replace(/^(\d+(?:\/\d+)?)(?:st|nd|rd|th)\b/i, '$1').replace(/^one\b/, '1').replace(/^a(n)?\b/, '1').trim();
  if (/^(?:\d+(?:\s+\d+\/\d+)?|\d+\/\d+|[¼½¾⅓⅔⅛⅜⅝⅞])\s+(?:to|-)\s+/.test(raw)) return raw;
  const unicode = { '¼': 0.25, '½': 0.5, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875 };
  const mixed = raw.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const joined = raw.match(/^(\d+)\s*([¼½¾⅓⅔⅛⅜⅝⅞])$/);
  if (joined) return Number(joined[1]) + unicode[joined[2]];
  if (unicode[raw] !== undefined) return unicode[raw];
  if (raw.includes('/')) {
    const [top, bottom] = raw.split('/').map(Number);
    if (bottom) return top / bottom;
  }
  const wordNumbers = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  if (wordNumbers[raw] !== undefined) return wordNumbers[raw];
  const number = Number(raw);
  return Number.isNaN(number) ? raw : number;
}

function parsePDFIngredient(raw) {
  const value = String(raw || '').replace(/[–—−]/g, '-').replace(/\b(\d{1,2})(\d\/\d)\b/g, '$1 $2').replace(/\s+/g, ' ').trim();
  if (!value) return null;
  const wordAmount = '(?:one|a|an|two|three|four|five|six|seven|eight|nine|ten)';
  const packet = value.match(new RegExp('^(' + wordAmount + ')\\s+(?:\\d+(?:\\.\\d+)?\\s*)?[¼½¾⅓⅔⅛⅜⅝⅞]?\\s*-\\s*(?:ounce|oz)\\s+packets?\\s+(.+)$', 'i'));
  if (packet) return { amount: parsePDFAmount(packet[1]), unit: 'packet', name: packet[2], category: inferCategory(packet[2]) };
  const packageMatch = value.match(new RegExp('^(' + wordAmount + ')\\s+(\\d+(?:\\.\\d+)?(?:\\s*[¼½¾⅓⅔⅛⅜⅝⅞])?)\\s*-\\s*(ounce|oz|pounds?|lbs?|lb)\\s+(packages?|packets?)\\s+(.+)$', 'i'));
  if (packageMatch) return { amount: parsePDFAmount(packageMatch[1]), unit: singularPDFUnit(packageMatch[4]), name: packageMatch[2] + '-' + packageMatch[3] + ' ' + packageMatch[5], category: inferCategory(packageMatch[5]) };
  const numberPattern = PDF_NUMBER_PATTERN;
  const amountPattern = '(?:' + wordAmount + '\\s+)?' + numberPattern + '(?:\\s+(?:to|-)\\s+' + numberPattern + ')?';
  const unitPattern = '(?:teaspoons?|tsp|tablespoons?|tbsp|cups?|ounces?|oz|pounds?|lbs?|lb|grams?|g|kilograms?|kg|quarts?|qt|pints?|pt|gallons?|gal|cloves?|cans?|heads?|slices?|large|small|medium|loaves?|loaf|packages?|package|packets?|packet|pouches?|pouch|bags?|bag|boxes?|box|containers?|container|jars?|jar|tortillas?|stalks?|sprigs?|sticks?|pieces?|fillets?|bunch|balls?|rounds?|pans?|dozen)';
  const descriptorAmount = value.match(new RegExp('^(?:juice of|(?:finely )?grated zest (?:and juice )?of|seeds from)\\s+(' + amountPattern + ')\\s+(.+)$', 'i'));
  if (descriptorAmount) return { amount: parsePDFAmount(descriptorAmount[1]), unit: '', name: descriptorAmount[2].trim(), category: inferCategory(descriptorAmount[2]) };
  const wordSizedPackage = value.match(new RegExp('^(' + wordAmount + ')\\s+(' + numberPattern + ')\\s*-\\s*(ounce|oz|pounds?|lbs?|lb)\\s+(packages?|packets?|pouches?|bags?|boxes?|containers?|jars?|cans?)\\s+(?:or\\s+(?:packages?|packets?|pouches?|bags?|boxes?|containers?|jars?|cans?)\\s+)?(.+)$', 'i'));
  if (wordSizedPackage) return { amount: parsePDFAmount(wordSizedPackage[1]), unit: singularPDFUnit(wordSizedPackage[4]), name: wordSizedPackage[2] + '-' + wordSizedPackage[3] + ' ' + wordSizedPackage[5], category: inferCategory(wordSizedPackage[5]) };
  const sizedPackage = value.match(new RegExp('^(' + numberPattern + '(?:\\s+(?:to|-)\\s+' + numberPattern + ')?)\\s*-\\s*(ounce|oz|pounds?|lbs?|lb)\\s+(packages?|packets?|pouches?|bags?|boxes?|containers?|jars?|cans?)\\s+(?:or\\s+(?:packages?|packets?|pouches?|bags?|boxes?|containers?|jars?|cans?)\\s+)?(.+)$', 'i'));
  if (sizedPackage) return { amount: parsePDFAmount(sizedPackage[1]), unit: singularPDFUnit(sizedPackage[3]), name: sizedPackage[4], category: inferCategory(sizedPackage[4]) };
  const wordSized = value.match(new RegExp('^(' + wordAmount + ')\\s+(' + numberPattern + ')\\s*-\\s*(ounce|oz|pounds?|lbs?|lb|inch|in)\\s+(.+)$', 'i'));
  if (wordSized) return { amount: parsePDFAmount(wordSized[1]), unit: '', name: wordSized[2] + '-' + wordSized[3] + ' ' + wordSized[4], category: inferCategory(wordSized[4]) };
  const thickSlices = value.match(new RegExp('^(' + amountPattern + ')\\s+(?:thick|thin|thickly)\\s+(slices?)\\s+(.+)$', 'i'));
  if (thickSlices) {
    const name = thickSlices[3].trim().replace(/^swiss$/i, 'Swiss cheese');
    return { amount: parsePDFAmount(thickSlices[1]), unit: thickSlices[2], name, category: inferCategory(name) };
  }
  const oneRange = value.match(new RegExp('^(?:one|a|an)\\s+(' + numberPattern + ')\\s*-\\s*to\\s*(' + numberPattern + ')\\s*-\\s*(' + unitPattern + ')\\s+(.+)$', 'i'));
  if (oneRange) return { amount: 1, unit: '', name: oneRange[1] + '- to ' + oneRange[2] + '-' + oneRange[3] + ' ' + oneRange[4], category: inferCategory(oneRange[4]) };
  const oneSized = value.match(new RegExp('^(?:one|a|an)\\s+(' + numberPattern + ')\\s*-\\s*(' + unitPattern + ')\\s+(.+)$', 'i'));
  if (oneSized) return { amount: 1, unit: '', name: oneSized[1] + '-' + oneSized[2] + ' ' + oneSized[3], category: inferCategory(oneSized[3]) };
  const plusContinuation = value.match(new RegExp('^(.+?)\\s+(plus|and)\\s+(' + amountPattern + ')\\s+(' + unitPattern + ')$', 'i'));
  if (plusContinuation) {
    const base = parsePDFIngredient(plusContinuation[1]);
    if (base?.name) {
      base.amount = (formatAmount(base.amount) + ' ' + (base.unit || '') + ' ' + plusContinuation[2] + ' ' + formatAmount(parsePDFAmount(plusContinuation[3])) + ' ' + plusContinuation[4]).replace(/\s+/g, ' ').trim();
      base.unit = '';
      return base;
    }
  }
  const withUnit = value.match(new RegExp('^(' + amountPattern + ')(?:\\s*-\\s*|\\s+)(' + unitPattern + ')\\s+(.+)$', 'i'));
  if (withUnit) {
    const name = withUnit[3].trim().replace(/^swiss$/i, 'Swiss cheese');
    return { amount: parsePDFAmount(withUnit[1]), unit: withUnit[2], name, category: inferCategory(name) };
  }
  const withoutUnit = value.match(new RegExp('^(' + amountPattern + ')\\s+(.+)$', 'i'));
  if (withoutUnit) return { amount: parsePDFAmount(withoutUnit[1]), unit: '', name: withoutUnit[2].trim(), category: inferCategory(withoutUnit[2]) };
  return { amount: '', unit: '', name: value, category: inferCategory(value) };
}

function collectPDFInstructions(lines, startIndex, firstLine = '') {
  const instructions = [];
  let current = '';
  const addLine = line => {
    const value = String(line || '').replace(/\s+/g, ' ').trim();
    if (!value) return false;
    const numbered = value.match(/^(?:\d+)[.)]\s*(.*)$/);
    if (/^(?:makes|yield|serves)\b/i.test(value)) {
      if (current) instructions.push(current.trim());
      current = '';
      return true;
    }
    if (numbered) {
      if (current) instructions.push(current.trim());
      current = numbered[1].trim();
    } else if (current) {
      current += ' ' + value;
    } else {
      current = value;
    }
    return false;
  };
  if (firstLine) addLine(firstLine);
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    if (addLine(lines[index])) break;
  }
  if (current) instructions.push(current.trim());
  return instructions.filter(step => step.length > 8);
}
function isPDFIngredientArtifact(item) {
  const name = String(item?.name || '').replace(/\s+/g, ' ').trim();
  if (!name) return true;
  if (/^(?:prep|cook|cool)(?:\s*:|\b)/i.test(name)) return true;
  if (/^(?:none|minutes?(?:\s+minutes?)?|hours?|hour|days?|weeks?|chilling|standing|rising|processing(?:\s+the)?|jars|or|for|brushing|serving|optional|juice of|(?:finely )?grated zest (?:and juice )?of|seeds from)$/i.test(name)) return true;
  if (new RegExp('^' + PDF_UNIT_PATTERN + '$', 'i').test(name)) return true;
  if (/^(?:one\s+)?\d+(?:[½¼¾⅓⅔⅛⅜⅝⅞]|\s+\d+\/\d+)?\s*(?:-|to)?\s*\d*(?:[½¼¾⅓⅔⅛⅜⅝⅞]|\s+\d+\/\d+)?\s*-?$/i.test(name)) return true;
  if (/^(?:as needed\s+)?(?:one|a|an)?\s*\d+(?:[½¼¾⅓⅔⅛⅜⅝⅞]|\s+\d+\/\d+)?\s*(?:-\s*to|to|-)?\s*\d*(?:[½¼¾⅓⅔⅛⅜⅝⅞]|\s+\d+\/\d+)?\s*-?$/i.test(name)) return true;
  if (/^(?:(?:fresh|frozen|dried|chopped|minced|sliced|diced|grated|shredded|packed|ground|cracked|trimmed|peeled|thick|thin|stone-ground|whole-grain|flat-leaf|long-grain|short-grain|all-purpose|baby|young|finely|coarsely)\s+){1,4}(?:fresh|frozen|dried|chopped|minced|sliced|diced|grated|shredded|packed|ground|cracked|trimmed|peeled|thick|thin|stone-ground|whole-grain|flat-leaf|long-grain|short-grain|all-purpose|baby|young)?$/i.test(name)) return true;
  if (/^(?:\d+(?:[½¼¾⅓⅔⅛⅜⅝⅞])?\s*)?inch(?:es)?\s+(?:thick|wide|long)$/i.test(name)) return true;
  if (/^inches?\s+(?:thick|wide|long)$/i.test(name)) return true;
  if (/^(?:\d+\s+)?minutes?\s*;?\s*(?:to|plus)?/i.test(name)) return true;
  if (name === name.toUpperCase() && /[A-Z]/.test(name) && name.length <= 60) return true;
  return false;
}
function cleanPDFIngredientName(value) {
  return String(value || '').replace(/\s*\(?\s*(?:see|refer to)\s+(?:Note|Tip)\)?/gi, '').replace(/\s*\(about [^)]*;\s*$/i, '').replace(/\s*\(about\s*$/i, '').replace(/^\s*(?:Note|Tip)\)?\s*/i, '').replace(/\s+\d+[.)]?$/i, '').replace(/^[,;]\s*/g, '').replace(/,\s*;/g, ';').replace(/\s+([,;.)])/g, '$1').replace(/\s+/g, ' ').trim();
}
function mergePDFIngredientContinuations(items) {
  const merged = [];
  for (const item of items) {
    item.name = cleanPDFIngredientName(item.name);
    const previous = merged[merged.length - 1];
    const name = String(item?.name || '').trim();
    if (!name) continue;
    const standaloneUnmeasured = item.amount === '' && /^(?:kosher salt|freshly (?:ground|cracked) black pepper|juice of|(?:finely )?grated zest|seeds from|flaky salt|thyme sprigs|lemon wedges|parsley|fresh parsley|minced fresh parsley|cooking spray|vegetable oil spray|nonstick .* spray|toasted pepitas|hot fudge sauce)\b/i.test(name);
    if (standaloneUnmeasured) {
      if (previous && previous.amount === '' && /(?:salt|pepper|juice|zest|seeds|sprigs|wedges|parsley|spray|pepitas|sauce)\b/i.test(String(previous.name || ''))) previous.name = `${previous.name} ${name}`.replace(/\s+/g, ' ').trim();
      else merged.push(item);
      continue;
    }
    const previousUnitOnly = previous && previous.amount !== '' && !previous.unit && new RegExp('^' + PDF_UNIT_PATTERN + '$', 'i').test(String(previous.name || '').trim());
   if (previousUnitOnly && item.amount === '') {
     previous.unit = previous.name;
     previous.name = name;
     continue;
   }
    if (previous && item.amount === '' && /(?:minced|chopped|sliced|diced|grated|shredded|fresh|dried|ground|cracked|baby|young|flat-leaf|long-grain|short-grain|all-purpose)$/i.test(previous.name || '')) {
      previous.name = `${previous.name} ${name}`.replace(/\s+/g, ' ').trim();
      continue;
    }
    if (previous && item.amount === '' && /^(?:\(|,|or\b)/i.test(name)) {
      previous.name = `${previous.name} ${name}`.replace(/\s+/g, ' ').trim();
      continue;
    }
    const bareQuantity = item.amount !== '' && !item.unit && /^(?:teaspoons?|tsp|tablespoons?|tbsp|cups?|ounces?|oz|pounds?|lbs?|lb|grams?|g|kilograms?|kg|cloves?|cans?|heads?|slices?|large|small|medium|loaves?|loaf|packets?|packet|stalks?|sprigs?|sticks?|pieces?|fillets?|bunch|balls?|rounds?|jars?|pans?|dozen)$/i.test(name);
    if (previous && bareQuantity && /(?:plus|and)$/i.test(String(previous.name || '').trim())) {
      const joiner = String(previous.name).trim().match(/(plus|and)$/i)[1];
      previous.name = String(previous.name).replace(new RegExp('(?:^|\\s)' + joiner + '\\s*$', 'i'), '').trim();
      previous.amount = (formatAmount(previous.amount) + ' ' + (previous.unit || '') + ' ' + joiner + ' ' + formatAmount(item.amount) + ' ' + name).replace(/\s+/g, ' ').trim();
      previous.unit = '';
      continue;
    }
    if (previous && item.amount !== '' && /(?:plus|and)$/i.test(String(previous.name || '').trim())) {
      const joiner = String(previous.name).trim().match(/(plus|and)$/i)[1];
      const baseName = String(previous.name).replace(new RegExp('(?:^|\\s)' + joiner + '\\s*$', 'i'), '').trim();
      const firstAmount = [formatAmount(previous.amount), previous.unit].filter(Boolean).join(' ');
      const secondAmount = [formatAmount(item.amount), item.unit].filter(Boolean).join(' ');
      previous.amount = [firstAmount, secondAmount].filter(Boolean).join(' ' + joiner + ' ');
      previous.unit = '';
      previous.name = [baseName, name].filter(Boolean).join('; ');
      continue;
    }
    if (previous && item.amount === '' && /(?:,|preferably|plus|or|and|for|at|of)$/i.test(String(previous.name || '').trim())) {
      previous.name = `${previous.name} ${name}`.replace(/\s+/g, ' ').trim();
      continue;
    }
    if (previous && item.amount !== '' && /^for\b/i.test(name)) {
      item.name = `${String(previous.name || '').split(',')[0].trim()} ${name}`.trim();
    }
    merged.push(item);
  }
  return merged.map(item => ({ ...item, name: cleanPDFIngredientName(item.name) }));
}

function isPDFTimingSegment(value) {
  return /^(?:\d+(?:\s+(?:to|-)\s+\d+)?|[¼½¾⅓⅔⅛⅜⅝⅞])\s*(?:minutes?|hours?|days?|weeks?)\b/i.test(String(value || '').trim());
}
function isPDFTimingLike(value) {
  const cleaned = String(value || '')
    .replace(/\b(?:prep|cook|cool)\s*:?\s*/gi, ' ')
    .replace(/\b(?:about|under|at least|plus|least|none|chilling|overnight)\b/gi, ' ')
    .replace(/\b\d+(?:\.\d+)?(?:\s*(?:to|-)\s*\d+(?:\.\d+)?)?\s*(?:minutes?|hours?|days?|weeks?)?\b/gi, ' ')
    .replace(/[,:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return !cleaned || !/[a-z]{3,}/i.test(cleaned);
}
function stripPDFTimingText(value) {
  return String(value || '')
    .replace(/\b(?:prep|cook|cool)\s*:?\s*(?:none|\d+(?:\.\d+)?(?:\s*(?:to|-)\s*\d+(?:\.\d+)?)?\s*(?:minutes?|hours?|days?|weeks?)?|\d+(?:\.\d+)?(?:\s*(?:to|-)\s*\d+(?:\.\d+)?)?)/gi, ' ')
    .replace(/\b(?:\d+(?:\s*(?:to|-)\s*\d+)?|[¼½¾⅓⅔⅛⅜⅝⅞])\s*(?:minutes?|hours?|days?|weeks?)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function isPDFIngredientLine(value) {
  const line = String(value || '').trim();
  const cleaned = stripPDFTimingText(line);
  if (!cleaned || isPDFTimingSegment(cleaned)) return false;
  const starts = findPDFIngredientStarts(cleaned);
  if (/\b(?:prep|cook|cool)\s*:/i.test(line)) {
    const labels = [...line.matchAll(/\b(?:prep|cook|cool)\s*:/gi)];
    const lastLabel = labels[labels.length - 1]?.index ?? -1;
    return starts.some((start, index) => start > lastLabel && !isPDFTimingLike(line.slice(start, starts[index + 1] || line.length)));
  }
  return starts.some((start, index) => !isPDFTimingSegment(cleaned.slice(start, starts[index + 1] || cleaned.length))) || PDF_UNMEASURED_MARKER.test(cleaned);
}

function parsePDFRecipeText(text, descriptor) {
  const escapedTitle = String(descriptor?.title || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const titleHeading = escapedTitle ? new RegExp('(?:^|\\s)' + escapedTitle + '(?=\\s|$)', 'gi') : null;
  const lines = String(text || '').replace(/\u00a0/g, ' ').replace(/\b(\d{1,2})(\d\/\d)\b/g, '$1 $2').split(/\n+/).map(line => { const normalized = line.replace(/\s+/g, ' ').trim(); return titleHeading ? normalized.replace(titleHeading, ' ').replace(/\s+/g, ' ').trim() : normalized; }).filter(Boolean);
  const timingIndex = lines.findIndex(line => /\bprep\s*:/i.test(line));
  if (timingIndex < 0) return { title: descriptor.title, section: descriptor.section, ingredients: [], instructions: [], pageStart: descriptor.pageIndex + 1 };
  const timingLine = lines[timingIndex];
  const timingStarts = findPDFIngredientStarts(timingLine);
  const timingIngredients = timingStarts
    .map((start, index) => timingLine.slice(start, timingStarts[index + 1] || timingLine.length).trim())
    .filter(segment => !isPDFTimingSegment(segment) && !isPDFTimingLike(segment) && !isPDFHeadingLike(segment))
    .join(' ');
  let instructionLineIndex = lines.findIndex((line, index) => index >= timingIndex && /(?:^|\s)1[.)]\s+/.test(line));
  let firstInstruction = '';
  let instructionPrefix = '';
  if (instructionLineIndex >= 0) {
    const line = lines[instructionLineIndex];
    const marker = line.search(/(?:^|\s)1[.)]\s+/);
    instructionPrefix = marker >= 0 ? line.slice(0, marker).trim() : '';
    firstInstruction = marker >= 0 ? line.slice(marker).trim() : line;
  } else {
    instructionLineIndex = lines.findIndex((line, index) => index > timingIndex && /^(?:place|preheat|in a |add |combine|pour |stir |whisk |cook |store |serve |drizzle |set |bring |prepare |using |heat |remove |transfer |mix |line |cover |let |cut |toast |bake |roast |brush |fold |divide |form |roll |shape )/i.test(line));
    if (instructionLineIndex >= 0) firstInstruction = lines[instructionLineIndex];
    if (instructionLineIndex < 0) {
      const actionPattern = /\s+(?=(?:add|place|preheat|combine|pour|stir|whisk|cook|store|serve|drizzle|set|bring|prepare|heat|remove|transfer|mix|line|cover|toast|bake|roast|brush|fold|divide|roll)\b)/i;
      instructionLineIndex = lines.findIndex((line, index) => index > timingIndex && actionPattern.test(line));
      if (instructionLineIndex >= 0) {
        const splitAt = lines[instructionLineIndex].search(actionPattern);
        instructionPrefix = lines[instructionLineIndex].slice(0, splitAt).trim();
        firstInstruction = lines[instructionLineIndex].slice(splitAt).trim();
      }
    }
  }
  const ingredientLines = [];
  if (timingIngredients) ingredientLines.push(timingIngredients);
  const firstIngredientLineIndex = lines.findIndex((line, index) => index > timingIndex && isPDFIngredientLine(line));
  const ingredientStartIndex = firstIngredientLineIndex >= 0 ? firstIngredientLineIndex : timingIndex + 1;
  ingredientLines.push(...lines.slice(ingredientStartIndex, instructionLineIndex >= 0 ? instructionLineIndex : lines.length));
  if (instructionPrefix) ingredientLines.push(instructionPrefix);
  const ingredients = mergePDFIngredientContinuations(splitPDFIngredientBlock(ingredientLines).map(parsePDFIngredient).filter(Boolean)).filter(item => !isPDFIngredientArtifact(item));
  const instructions = instructionLineIndex >= 0 ? collectPDFInstructions(lines, instructionLineIndex, firstInstruction) : [];
  return { title: descriptor.title, section: descriptor.section, ingredients, instructions, pageStart: descriptor.pageIndex + 1 };
}

function openBulkCookbookModal() {
  bulkImportDraft = [];
  $('bulkCookbookName').value = '';
  $('bulkCookbookFile').value = '';
  $('bulkImportStatus').textContent = 'Choose a recipe-book PDF to begin.';
  $('bulkImportSummary').textContent = '';
  $('bulkImportSummary').classList.add('hidden');
  $('bulkImportList').innerHTML = '';
  $('bulkImportList').classList.add('hidden');
  $('importBulkRecipes').disabled = true;
  openModal('bulkCookbookModal');
}

function renderBulkImportPreview() {
  const usable = bulkImportDraft.filter(recipe => recipe.ingredients.length && recipe.instructions.length).length;
  $('bulkImportSummary').textContent = 'Found ' + bulkImportDraft.length + ' recipes. ' + usable + ' have ingredients and instructions ready to import; you can leave any uncertain entries unchecked.';
  $('bulkImportSummary').classList.remove('hidden');
  $('bulkImportList').innerHTML = bulkImportDraft.length ? bulkImportDraft.map((recipe, index) => '<label class="bulk-import-item"><input type="checkbox" data-bulk-index="' + index + '" ' + (recipe.ingredients.length && recipe.instructions.length ? 'checked' : 'disabled') + ' /><span>' + escapeHTML(recipe.title) + '</span><small>' + escapeHTML(recipe.section) + ' · p. ' + recipe.pageStart + (isPlannerMealSection(recipe.section) ? '' : ' · Library only') + '</small></label>').join('') : '<div class="bulk-import-empty">No recipe bookmarks were found in this PDF.</div>';
  $('bulkImportList').classList.remove('hidden');
  $('importBulkRecipes').disabled = !usable;
}

async function readBulkCookbookPDF() {
  const file = $('bulkCookbookFile').files[0];
  if (!file) { $('bulkImportStatus').textContent = 'Choose a PDF first.'; return; }
  $('readBulkCookbook').disabled = true;
  $('importBulkRecipes').disabled = true;
  $('bulkImportSummary').classList.add('hidden');
  $('bulkImportList').classList.add('hidden');
  $('bulkImportStatus').textContent = 'Opening the PDF privately in this browser…';
  try {
    const pdfjs = await loadPDFJS();
    if (!pdfjs) throw new Error('PDF reader unavailable');
    pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    const outline = await pdf.getOutline();
    const outlineRecipes = (await collectPDFRecipeOutline(pdf, outline)).sort((a, b) => a.pageIndex - b.pageIndex);
    if (!outlineRecipes.length) throw new Error('No recipe bookmarks found');
    const textCache = new Map();
    let pagesRead = 0;
    bulkImportDraft = [];
    for (let index = 0; index < outlineRecipes.length; index += 1) {
      const descriptor = outlineRecipes[index];
      const endPage = outlineRecipes[index + 1]?.pageIndex ?? pdf.numPages;
      const pages = [];
      for (let pageIndex = descriptor.pageIndex; pageIndex < endPage; pageIndex += 1) {
        if (!textCache.has(pageIndex)) {
          const page = await pdf.getPage(pageIndex + 1);
          textCache.set(pageIndex, await pdfPageToText(page));
          pagesRead += 1;
          if (pagesRead % 8 === 0) $('bulkImportStatus').textContent = 'Reading page ' + pagesRead + ' of ' + pdf.numPages + '…';
        }
        pages.push(textCache.get(pageIndex));
      }
      const parsedRecipe = parsePDFRecipeText(pages.join('\n'), descriptor);
      parsedRecipe.sourceText = pages.join('\n');
      let imagePageIndex = -1;
      for (let pageIndex = descriptor.pageIndex; pageIndex < endPage && imagePageIndex < 0; pageIndex += 1) {
        try {
          const imagePage = await pdf.getPage(pageIndex + 1);
          if (await pdfPageHasEmbeddedImage(imagePage)) imagePageIndex = pageIndex;
        } catch {}
      }
      try {
        const fallbackPageOffset = pages.findIndex(text => text && text.length > 80);
        const fallbackPageIndex = imagePageIndex >= 0 ? imagePageIndex : (fallbackPageOffset >= 0 ? descriptor.pageIndex + fallbackPageOffset : descriptor.pageIndex);
        const imagePage = await pdf.getPage(fallbackPageIndex + 1);
        parsedRecipe.imageData = await pdfPageToImage(imagePage);
      } catch {}
      bulkImportDraft.push(parsedRecipe);
    }
    const metadata = await pdf.getMetadata().catch(() => null);
    if (!$('bulkCookbookName').value.trim()) $('bulkCookbookName').value = /magnolia-table-volume-3/i.test(file.name) ? 'Magnolia Table, Volume 3' : (metadata?.info?.Title || file.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim());
    renderBulkImportPreview();
    $('bulkImportStatus').textContent = 'Finished reading ' + pdf.numPages + ' pages. Review the recipe list, then import the checked recipes.';
  } catch {
    bulkImportDraft = [];
    $('bulkImportStatus').textContent = 'I could not split this PDF. It may not contain recipe bookmarks, or the browser PDF reader could not load.';
  } finally {
    $('readBulkCookbook').disabled = false;
  }
}

async function importBulkRecipes() {
  const selected = bulkImportDraft.filter((recipe, index) => document.querySelector('input[data-bulk-index="' + index + '"]')?.checked);
  if (!selected.length) { showToast('Select at least one recipe to import.'); return; }
  const cookbookName = $('bulkCookbookName').value.trim() || 'Imported cookbook';
  const cookbook = { id: 'book-' + Date.now(), name: cookbookName };
  cookbooks = [cookbook, ...cookbooks];
  const imageRecords = [];
  const sourceRecords = [];
  const imported = selected.map((recipe, index) => {
    const id = 'r' + Date.now() + '-' + index;
    if (recipe.imageData) imageRecords.push({ id, data: recipe.imageData });
    if (recipe.sourceText) sourceRecords.push({ id, text: recipe.sourceText, title: recipe.title, section: recipe.section, pageStart: recipe.pageStart });
    return {
      id,
      ownerId: currentUser?.id || '',
      title: recipe.title,
      source: cookbookName,
      sourceType: 'cookbook',
      section: recipe.section,
      mealType: isPlannerMealSection(recipe.section) ? 'meal' : 'library-only',
      cookbookId: cookbook.id,
      sourceUrl: '',
      rating: 0,
      time: 'Flexible',
      accent: ACCENTS[(recipes.length + index) % ACCENTS.length],
      tags: [recipe.section],
      ingredients: recipe.ingredients,
      instructions: recipe.instructions,
      scanFileName: $('bulkCookbookFile').files[0]?.name || '',
      scanData: '',
      sourcePage: recipe.pageStart,
      sourceTextId: recipe.sourceText ? id : '',
      parserVersion: PDF_PARSER_VERSION
    };
  });
  await Promise.all(imageRecords.map(record => saveRecipeImage(record.id, record.data)));
  await Promise.all(sourceRecords.map(record => saveRecipeSource(record.id, record.text, record)));
  imageRecords.forEach(record => { recipeImageCache[record.id] = record.data; });
  recipes = [...imported, ...recipes];
  save(STORAGE.cookbooks, cookbooks);
  save(STORAGE.recipes, recipes);
  closeModal('bulkCookbookModal');
  render();
  showToast(imported.length + ' recipes added from ' + cookbookName + '.');
}

function render() {
  repairStoredRecipesInPlace();
  renderNav();
  renderLibrary();
  renderPlanner();
  renderShopping();
}

function renderNav() {
  document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.view === activeView));
  document.querySelectorAll('[data-view-panel]').forEach(panel => panel.classList.toggle('active', panel.dataset.viewPanel === activeView));
  $('recipeCount').textContent = recipes.length;
  $('shoppingDot').classList.toggle('show', plan.some(slot => slot.recipeId));
  $('resetDemo')?.classList.toggle('hidden', !canManageRecipes());
  const titles = { library: ["What's for dinner?", 'A calmer way to choose the good stuff.'], planner: ['Shape the week.', 'Lock a few keepers, then let chance do the rest.'], shopping: ['Ready when you are.', 'A tidy list for the meals you actually want to make.'] };
  $('pageTitle').textContent = titles[activeView][0];
  $('pageSubtitle').textContent = titles[activeView][1];
}

function renderLibrary() {
  const query = $('librarySearch').value.toLowerCase().trim();
  const source = $('sourceFilter').value;
  const rating = $('ratingFilter').value;
  const filtered = recipes.filter(recipe => {
    const haystack = [recipe.title, recipe.source, ...(recipe.tags || []), ...recipe.ingredients.map(item => item.name)].join(' ').toLowerCase();
    const searchMatch = !query || haystack.includes(query);
    const sourceMatch = source === 'all' || recipe.sourceType === source;
    const ratingMatch = rating === 'all' || (rating === 'unrated' ? recipe.rating === 0 : recipe.rating >= Number(rating));
    return searchMatch && sourceMatch && ratingMatch;
  });
  $('libraryTotal').textContent = recipes.length;
  $('libraryRated').textContent = recipes.filter(recipe => recipe.rating >= 4).length;
  $('recipeGrid').innerHTML = filtered.map(recipeCard).join('');
  $('recipeGrid').classList.toggle('hidden', filtered.length === 0);
  $('libraryEmpty').classList.toggle('hidden', filtered.length !== 0);
}

function recipeCard(recipe) {
  const sourceLabel = recipe.sourceType === 'cookbook' ? 'Cookbook scan' : recipe.sourceType === 'internet' ? 'Internet recipe' : 'Typed by us';
  const ratingButtons = [1,2,3,4,5].map(value => `<button class="${recipe.rating >= value ? 'active' : ''}" data-action="rate" data-id="${recipe.id}" data-rating="${value}" aria-label="Rate ${value} stars">★</button>`).join('');
  const weekAction = isPlannerMeal(recipe) ? `<button data-action="add-week" data-id="${recipe.id}">＋ Add to week</button>` : '<span class="library-only-label">Library only</span>';
  const deleteAction = canManageRecipes() ? `<button class="card-delete" data-action="delete-recipe" data-id="${recipe.id}">Delete</button>` : '';
  return `<article class="recipe-card">
    ${recipeArtwork(recipe, 'recipe-art', `<span class="recipe-source-pill">${sourceLabel}</span>`)}
    <div class="recipe-card-body"><h3>${escapeHTML(recipe.title)}</h3><div class="recipe-source">${escapeHTML(recipe.source || 'Personal recipe')}</div>
      <div class="card-meta"><div class="rating-inline" aria-label="${recipe.rating} out of 5 stars">${ratingButtons}</div><span class="time-meta">◷ ${escapeHTML(recipe.time || 'Flexible')}</span></div>
      <div class="ingredient-hint">${recipe.ingredients.slice(0, 3).map(item => escapeHTML(item.name)).join(' · ')}</div>
      <div class="card-actions"><div class="card-action-group"><button class="card-link" data-action="details" data-id="${recipe.id}">View recipe ↗</button>${deleteAction}</div>${weekAction}</div>
    </div></article>`;
}

function renderPlanner() {
  let removedNonMeals = false;
  plan.forEach(slot => { if (slot.recipeId && !isPlannerMeal(getRecipe(slot.recipeId))) { slot.recipeId = null; slot.locked = false; removedNonMeals = true; } });
  if (removedNonMeals) save(STORAGE.plan, plan);
  $('mealCount').value = targetMeals;
  const visibleSlots = plan.slice(0, targetMeals);
  const locked = visibleSlots.filter(slot => slot.recipeId && slot.locked).length;
  const picked = visibleSlots.filter(slot => slot.recipeId).length;
  $('lockedCount').textContent = locked;
  $('plannerSummary').textContent = `${picked} of ${targetMeals} meals picked`;
  $('weekGrid').innerHTML = visibleSlots.map((slot, index) => plannerSlot(slot, index)).join('');
  renderPlannerSearch();
}

function plannerSlot(slot, index) {
  const recipe = getRecipe(slot.recipeId);
  if (!recipe) return `<div class="day-column"><div class="day-label">${DAYS[index].slice(0, 3)} <span>${index + 3}</span></div><div class="meal-slot empty-slot"><div><div class="slot-plus">＋</div><strong>Open for a good idea</strong><span>Randomize or choose from your collection.</span></div></div></div>`;
  const ratingButtons = [1,2,3,4,5].map(value => `<button class="${recipe.rating >= value ? 'active' : ''}" data-action="rate" data-id="${recipe.id}" data-rating="${value}" aria-label="Rate ${value} stars">★</button>`).join('');
  return `<div class="day-column"><div class="day-label">${DAYS[index].slice(0, 3)} <span>${index + 3}</span></div><div class="meal-slot filled">
    ${recipeArtwork(recipe, 'slot-art')}<h3>${escapeHTML(recipe.title)}</h3><div class="recipe-source">${escapeHTML(recipe.source || 'Personal recipe')}</div>
    <div class="slot-footer"><div class="rating-inline compact" aria-label="${recipe.rating} out of 5 stars">${ratingButtons}</div><div class="slot-actions"><button class="${slot.locked ? 'locked' : ''}" data-action="toggle-lock" data-index="${index}" title="${slot.locked ? 'Unlock recipe' : 'Lock recipe'}">${slot.locked ? '🔒' : '♢'}</button><button data-action="remove-week" data-index="${index}" title="Remove recipe">×</button></div></div>
  </div></div>`;
}

function renderPlannerSearch() {
  const panel = $('plannerSearchPanel');
  if (panel.classList.contains('hidden')) return;
  const query = $('plannerSearch').value.toLowerCase().trim();
  const results = recipes.filter(recipe => isPlannerMeal(recipe) && (!query || [recipe.title, recipe.source, ...recipe.ingredients.map(item => item.name)].join(' ').toLowerCase().includes(query))).slice(0, 6);
  $('plannerSearchResults').innerHTML = results.length ? results.map(recipe => `<div class="planner-result">${recipeArtwork(recipe, 'result-swatch')}<div class="planner-result-copy"><strong>${escapeHTML(recipe.title)}</strong><span>${escapeHTML(recipe.source)} · ${recipe.rating ? `${recipe.rating}/5` : 'Not rated'}</span></div><button data-action="add-week" data-id="${recipe.id}">Add to week →</button></div>`).join('') : '<div class="shopping-empty">No recipes matched that search.</div>';
}

function storedIngredientName(value) {
  return cleanPDFIngredientName(value).replace(/^(?:(?:plus|and|or)\b\s*;?\s*)+/i, '').replace(/[?]+$/, '').replace(/\s+/g, ' ').trim();
}
function isPantryPreparedIngredient(name) { return /(?:soups?|broths?|stocks?|bouillon|soup base)/i.test(String(name || '')); }
function isPantrySeasoningIngredient(name) { return isPantryPreparedIngredient(name) || /\b(?:powder|granules?|seasonings?|spice blend|dry rub)\b/i.test(String(name || '')); }
function storedIngredientAmount(value) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value !== 'string') return value;
  let result = value.replace(/[;,]/g, ' ').replace(/\s+/g, ' ').trim();
  while (/(?:\s+(?:plus|and))$/i.test(result)) result = result.replace(/\s+(?:plus|and)$/i, '').trim();
  return result;
}
function storedUnitName(value) {
  return storedIngredientName(value).replace(/[.,;:]+$/, '').trim();
}
function isStoredUnitOnly(item) {
  return !item.unit && item.amount !== '' && new RegExp('^' + PDF_UNIT_PATTERN + '$', 'i').test(storedUnitName(item.name));
}
function isStoredContinuationName(name) {
  const value = storedIngredientName(name);
  return /^(?:dough|filling|topping|sauce|tartar sauce|ingredients?)$/i.test(value) ||
    /(?:minced|chopped|sliced|diced|grated|shredded|packed|fresh|dried|ground|cracked|thickly|thick|deli|frozen|baby|young|flat-leaf|long-grain|short-grain|all-purpose|stone-ground|whole-grain|pickled|from|of|plus|or|and|into|cut|-)$/i.test(value);
}
function storedIngredientText(item) {
  return [formatAmount(item.amount), item.unit, item.name].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}
function joinStoredIngredientNames(first, second) {
  return `${String(first || '').trim()} ${String(second || '').trim()}`.replace(/\s+/g, ' ').trim();
}
function isStoredUnmeasuredAmount(value) {
  return value === '' || /^as needed$/i.test(String(value || '').trim());
}
function storedOrphanAmount(value) {
  const text = storedIngredientName(value).replace(/[–—−]/g, '-').trim();
  const numberToken = '(?:one|a|an|two|three|four|five|six|seven|eight|nine|ten|\\d+(?:\\.\\d+)?(?:\\s+\\d+\\/\\d+|\\s*[' + PDF_FRACTIONS + '])?|\\d+\\/\\d+|[' + PDF_FRACTIONS + '])';
  const match = text.match(new RegExp('^(' + numberToken + '(?:\\s+(?:to|-)\\s+' + numberToken + ')?)\\s*-?$', 'i'));
  return match ? parsePDFAmount(match[1]) : '';
}
function repairContextualStoredMeasures(recipe, items) {
  const recipeText = [recipe?.title, recipe?.section, ...(recipe?.tags || []), ...(items || []).map(item => storedIngredientText(item)), ...(recipe?.instructions || [])].filter(Boolean).join(' ').toLowerCase();
  const isBeefTenderloinContext = /\bbeef tenderloin\b/.test(recipeText) && /(?:jalape[nñ]o|sour cream|pickled)/.test(recipeText);
  return (items || []).map(item => {
    let repaired = { ...item, name: storedIngredientName(item.name).replace(/^as needed\s+/i, '').trim() };
    const unmeasured = isStoredUnmeasuredAmount(repaired.amount);
    if (unmeasured && !repaired.unit) {
      const measuredName = repaired.name.match(new RegExp('^(' + PDF_UNIT_PATTERN + ')\\s+(.+)$', 'i'));
      if (measuredName) repaired = { ...repaired, unit: singularPDFUnit(measuredName[1]), name: storedIngredientName(measuredName[2]) };
    }
    if (isBeefTenderloinContext && isStoredUnmeasuredAmount(repaired.amount) && /^tablespoons?$/i.test(String(repaired.unit || '')) && /\bsalted butter\b/i.test(repaired.name) && /at room temp(?:erature)?/i.test(repaired.name)) {
      repaired = { ...repaired, amount: 2, unit: 'tablespoons' };
    }
    return repaired;
  });
}
function repairEmbeddedStoredMeasure(item) {
  const next = { ...item };
  const rawAmount = String(next.amount ?? '').trim();
  const needsMeasure = rawAmount === '' || /^as needed$/i.test(rawAmount);
  let name = storedIngredientName(next.name);
  name = name.replace(/^as needed\s+/i, '').trim();
  if (!needsMeasure) return { ...next, name };
  const leadingMeasured = parsePDFIngredient(name);
  if (leadingMeasured?.name && leadingMeasured.amount !== '' && !isPDFIngredientArtifact(leadingMeasured)) {
    return { ...next, amount: leadingMeasured.amount, unit: leadingMeasured.unit, name: storedIngredientName(leadingMeasured.name), category: next.category || leadingMeasured.category };
  }
  const measureToken = '(?:\\d+(?:\\.\\d+)?(?:\\s+\\d+\\/\\d+|\\s*[' + PDF_FRACTIONS + '])?|\\d+\\/\\d+|[' + PDF_FRACTIONS + '])';
  const embeddedMeasure = name.match(new RegExp('\\(\\s*(?:about|approximately|around)\\s+(' + measureToken + '(?:\\s+(?:to|-)\\s+' + measureToken + ')?)\\s+(' + PDF_UNIT_PATTERN + ')\\b[^)]*\\)', 'i'));
  if (embeddedMeasure) {
    return {
      ...next,
      amount: parsePDFAmount(embeddedMeasure[1]),
      unit: singularPDFUnit(embeddedMeasure[2]),
      name: storedIngredientName(name.replace(embeddedMeasure[0], '').replace(/\s+/g, ' ').trim())
    };
  }
  return { ...next, name };
}
function repairStoredIngredientItems(items, recipe = null) {
  const repaired = [];
  const expanded = [];
  for (const raw of Array.isArray(items) ? items : []) {
    const item = repairEmbeddedStoredMeasure({ ...raw, amount: storedIngredientAmount(raw?.amount), name: storedIngredientName(raw?.name || '') });
    const fullText = storedIngredientText(item);
    const starts = findPDFIngredientStarts(fullText);
    const markerFragments = splitPDFUnmeasuredLine(fullText);
    const markerParts = markerFragments.length > 1 ? markerFragments.flatMap(fragment => splitPDFIngredientBlock([fragment])) : [];
    const embeddedMeasuredStart = starts.some(start => start > 0 && /(?:thinly|thickly|finely|coarsely|roughly)?\s*(?:sliced|chopped|minced|diced|grated|shredded|smashed|cut)\s*$/i.test(fullText.slice(0, start)));
    const fragments = (starts[0] === 0 && starts.length > 1) || embeddedMeasuredStart ? splitPDFIngredientBlock([fullText]).map(parsePDFIngredient).filter(fragment => fragment && fragment.name && !isPDFIngredientArtifact(fragment)) : markerParts.length > 1 ? markerParts.map(parsePDFIngredient).filter(fragment => fragment && fragment.name && !isPDFIngredientArtifact(fragment)) : [];
    if (fragments.length > 1) fragments.forEach(fragment => expanded.push({ ...item, ...fragment }));
    else expanded.push(item);
  }
  for (let index = 0; index < expanded.length - 1; index += 1) {
    const current = expanded[index];
    const next = expanded[index + 1];
    const orphanAmount = isStoredUnmeasuredAmount(current.amount) && !current.unit ? storedOrphanAmount(current.name) : '';
    const nextName = storedIngredientName(next.name);
    const embeddedUnit = !next.unit ? nextName.match(new RegExp('^(' + PDF_UNIT_PATTERN + ')\\s+(.+)$', 'i')) : null;
    const nextUnit = storedUnitName(next.unit || embeddedUnit?.[1] || '');
    if (orphanAmount !== '' && isStoredUnmeasuredAmount(next.amount) && nextUnit && new RegExp('^' + PDF_UNIT_PATTERN + '$', 'i').test(nextUnit)) {
      expanded[index + 1] = { ...next, amount: orphanAmount, unit: nextUnit, name: embeddedUnit?.[2] ? storedIngredientName(embeddedUnit[2]) : next.name };
      expanded.splice(index, 1);
      index -= 1;
    }
  }
  for (const item of expanded) {
    const previous = repaired[repaired.length - 1];
    let previousName = String(previous?.name || '').trim();
    const itemName = String(item.name || '').trim();
    const itemIsUnmeasured = item.amount === '' || /^as needed$/i.test(String(item.amount || '').trim());
    if (previous && itemIsUnmeasured && /^dough\b/i.test(itemName) && /\bdough\b/i.test(previousName)) {
      const suffix = itemName.replace(/^dough\b\s*,?\s*/i, '').trim();
      previous.name = suffix ? `${previousName.replace(/[,;]\s*$/, '')}, ${suffix}` : previousName;
      continue;
    }
    if (previous && itemIsUnmeasured && (isStoredContinuationName(previousName) || /(?:,|from|of|plus|or|and|with|at|pickled)$/i.test(previousName))) {
      const continuationName = itemName.replace(/^as needed\s+/i, '').trim();
      if (continuationName) previous.name = joinStoredIngredientNames(previousName, continuationName);
      continue;
    }
    if (previous && item.amount === '' && /^[A-Z]/.test(String(item.name || '').trim()) && /(?:sharp|Monterey|Homemade|Poached|Chicken|Roma|Rice|Cheddar|Gruyère|Gruyere|Jack|Parmesan|Mozzarella|Velveeta)\s*$/i.test(previousName)) {
      previous.name = joinStoredIngredientNames(previousName, item.name);
      continue;
    }
    const embeddedAmount = previous && item.amount === '' && previousName.match(/\s((?:\d+(?:\.\d+)?|[¼½¾⅓⅔⅛⅜⅝⅞]))\s*$/);
    if (embeddedAmount && /^[A-Z]/.test(String(item.name || '').trim())) {
      previous.name = previousName.slice(0, embeddedAmount.index).trim();
      item.amount = parsePDFAmount(embeddedAmount[1]);
      previousName = previous.name;
    }
    if (previous && item.amount !== '' && /(?:juice of|zest of|seeds from)\s*$/i.test(previousName)) {
      previous.name = previousName.replace(/\s+(?:juice of|zest of|seeds from)\s*$/i, '').trim();
      previousName = previous.name;
    }
    if (previous && item.amount !== '' && !item.unit && /^(?:inch|inches)\b/i.test(String(item.name || '').trim()) && /(?:cut into|sliced|chopped|diced|batons?|strips?|pieces?)\b/i.test(previousName)) {
      previous.name = joinStoredIngredientNames(previousName, `${formatAmount(item.amount)}-${item.name}`);
      continue;
    }
    const unitOnly = isStoredUnitOnly(item);
    if (previous && unitOnly && /(?:plus|and)$/i.test(previousName)) {
      const joiner = previousName.match(/(plus|and)$/i)[1];
      previous.name = previousName.replace(new RegExp('(?:^|\\s)' + joiner + '\\s*$', 'i'), '').trim();
      previous.amount = [formatAmount(previous.amount), previous.unit, joiner, formatAmount(item.amount), storedUnitName(item.name)].filter(Boolean).join(' ');
      previous.unit = '';
      continue;
    }
    if (previous && previous.amount !== '' && !previous.unit && isStoredUnitOnly(previous) && isStoredUnmeasuredAmount(item.amount)) {
      previous.unit = storedUnitName(previous.name);
      previous.name = item.name;
      continue;
    }
    if (previous && previous.amount !== '' && /(?:plus|and)$/i.test(previousName) && item.amount !== '') {
      const joiner = previousName.match(/(plus|and)$/i)[1];
      const baseName = previousName.replace(new RegExp('(?:^|\\s)' + joiner + '\\s*$', 'i'), '').trim();
      const firstAmount = [formatAmount(previous.amount), previous.unit].filter(Boolean).join(' ');
      const secondAmount = [formatAmount(item.amount), item.unit].filter(Boolean).join(' ');
      previous.amount = [firstAmount, secondAmount].filter(Boolean).join(' ' + joiner + ' ');
      previous.unit = '';
      previous.name = [baseName, item.name].filter(Boolean).join('; ');
      continue;
    }
    if (previous && item.amount !== '' && /(?:from|of|with|or)$/i.test(previousName)) {
      previous.name = joinStoredIngredientNames(previousName, storedIngredientText(item));
      continue;
    }
    if (previous && item.amount !== '' && /(?:into|cut|about|approximately)$/i.test(previousName) && /^(?:pieces?|chunks?|slices?|strips?|wedges?|rings?|cubes?)\b/i.test(String(item.name || '').trim())) {
      previous.name = joinStoredIngredientNames(previousName, [formatAmount(item.amount), item.unit, item.name].filter(Boolean).join(' '));
      continue;
    }
    if (previous && item.amount === '' && (/-$/.test(previousName) || isStoredContinuationName(previousName) || /(?:,|plus|or|and|from|with|at|of)$/i.test(previousName))) {
      previous.name = joinStoredIngredientNames(previousName, item.name);
      continue;
    }
    if (previous && item.amount === '' && /^(?:\(|,|or\b|and\b|from\b|with\b)/i.test(item.name)) {
      previous.name = joinStoredIngredientNames(previousName, item.name);
      continue;
    }
    repaired.push(item);
  }
  const cleaned = repaired.map(item => {
    let repairedItem = { ...item, name: storedIngredientName(item.name) };
    if (/^stone-ground$/i.test(repairedItem.name) && /^(?:teaspoons?|tablespoons?)$/i.test(String(repairedItem.unit || ''))) repairedItem.name = 'stone-ground mustard';
    if (repairedItem.amount !== '' && !repairedItem.unit && /^(?:thick|thin|thickly)\s+slices?\s+swiss$/i.test(repairedItem.name)) {
      repairedItem = { ...repairedItem, unit: 'slices', name: 'Swiss cheese' };
    }
    if (repairedItem.name && (/^phyllo$/i.test(repairedItem.name) || /^swiss$/i.test(repairedItem.name))) {
      repairedItem.name = /^phyllo$/i.test(repairedItem.name) ? 'phyllo dough' : 'Swiss cheese';
    }
    if (isPantrySeasoningIngredient(repairedItem.name)) repairedItem.category = 'Pantry';
    const parsed = parsePDFIngredient(storedIngredientText(repairedItem));
    const hasCompoundAmount = typeof repairedItem.amount === 'string' && /\b(?:plus|and)\b/i.test(repairedItem.amount);
    if (parsed?.name && !isPDFIngredientArtifact(parsed) && !hasCompoundAmount && (repairedItem.amount === '' || repairedItem.unit === '' || parsed.name.length > repairedItem.name.length)) {
      repairedItem = { ...repairedItem, amount: parsed.amount, unit: parsed.unit, name: storedIngredientName(parsed.name), category: repairedItem.category || parsed.category };
    }
    return repairedItem;
  }).filter(item => !isPDFIngredientArtifact(item));
  return repairContextualStoredMeasures(recipe, cleaned);
}
function repairStoredRecipesInPlace() {
  let changed = false;
  recipes = recipes.map(recipe => {
    const ingredients = repairStoredIngredientItems(recipe.ingredients, recipe);
    if (JSON.stringify(ingredients) === JSON.stringify(recipe.ingredients || [])) return recipe;
    changed = true;
    return { ...recipe, ingredients };
  });
  if (changed) save(STORAGE.recipes, recipes);
}
function aggregateIngredients() {
  const grouped = {};
  plan.slice(0, targetMeals).forEach(slot => {
    const recipe = getRecipe(slot.recipeId);
    if (!recipe) return;
    repairStoredIngredientItems(recipe.ingredients, recipe).forEach(item => {
      if (!shouldIncludeShoppingIngredient(item)) return;
      const normalizedItem = normalizeShoppingIngredient(item);
      const inferredCategory = inferCategory(normalizedItem.name);
      const category = isPantrySeasoningIngredient(normalizedItem.name) ? 'Pantry' : (inferredCategory !== 'Pantry' || !normalizedItem.category ? inferredCategory : normalizedItem.category);
      const unit = normalizedItem.unit;
      const key = `${category || 'Other'}::${normalizedItem.name}::${unit}`;
      if (!grouped[key]) grouped[key] = { ...normalizedItem, category, total: 0, count: 0, key, hasNumeric: false, amounts: [] };
      const numeric = Number(normalizedItem.amount);
      if (!Number.isNaN(numeric) && normalizedItem.amount !== '' && normalizedItem.amount !== null && normalizedItem.amount !== undefined) { grouped[key].total += numeric; grouped[key].hasNumeric = true; }
      else {
        const displayAmount = [formatAmount(normalizedItem.amount), normalizedItem.unit].filter(Boolean).join(' ');
        if (displayAmount) {
          grouped[key].total = grouped[key].total ? grouped[key].total + ' + ' + displayAmount : displayAmount;
          grouped[key].hasNumeric = true;
          grouped[key].unit = '';
          grouped[key].amounts.push(displayAmount);
        }
      }
      grouped[key].count += 1;
    });
  });
  const items = Object.values(grouped).map(item => {
    const next = item.hasNumeric ? { ...item, unit: shoppingUnitLabel(item.unit, item.total) } : item;
    if (next.hasNumeric && !next.unit && Number(next.total) > 1 && /^(?:lemon|lime|onion|avocado|cucumber|tomato|apple|pear|potato|carrot|egg)$/i.test(next.name) && !/s$/i.test(next.name)) next.name += 's';
    return next;
  });
  return items.sort((a, b) => `${a.category}${a.name}`.localeCompare(`${b.category}${b.name}`));
}
function shoppingAmountLabel(item) {
  if (item.hasNumeric) {
    if (item.measurementFamily === 'volume') return volumeAmountLabel(item.total);
    if (item.measurementFamily === 'weight-imperial' || item.measurementFamily === 'weight-metric') return weightAmountLabel(item.total, item.measurementFamily);
    return `${formatAmount(item.total)} ${shoppingUnitLabel(item.unit, item.total)}`.trim();
  }
  if ((item.unit && new RegExp('^' + PDF_UNIT_PATTERN + '$', 'i').test(String(item.unit).trim())) || new RegExp('^' + PDF_UNIT_PATTERN + '\\s+', 'i').test(String(item.name || '').trim())) return 'quantity missing';
  return item.count > 1 ? `${item.count}×` : 'as needed';
}

function renderShopping() {
  const items = aggregateIngredients();
  const selectedRecipes = plan.slice(0, targetMeals).map(slot => getRecipe(slot.recipeId)).filter(Boolean);
  $('shoppingSubcopy').textContent = selectedRecipes.length ? `${selectedRecipes.length} recipes · ${items.length} consolidated ingredients` : 'Your consolidated list will appear here once meals are chosen.';
  if (!items.length) { $('shoppingListCard').innerHTML = '<h3>Shopping list</h3><div class="shopping-empty"><strong>Nothing on the list yet.</strong>Choose a few meals in your week plan and the ingredients will gather themselves here.</div>'; }
  else {
    const byCategory = items.reduce((acc, item) => { (acc[item.category || 'Other'] ||= []).push(item); return acc; }, {});
    $('shoppingListCard').innerHTML = `<h3>Shopping list</h3><div class="card-subtitle">Consolidated across ${selectedRecipes.length} recipes</div>${Object.entries(byCategory).map(([category, group]) => `<div class="shopping-group"><h4>${escapeHTML(category)}</h4>${group.map(item => { const checked = checkedItems[item.key]; const amount = shoppingAmountLabel(item); return `<label class="shopping-item ${checked ? 'checked' : ''}"><input type="checkbox" data-shopping-key="${escapeHTML(item.key)}" ${checked ? 'checked' : ''} /><span class="shopping-amount">${escapeHTML(amount)}</span><span class="shopping-name">${escapeHTML(item.name)}</span></label>`; }).join('')}</div>`).join('')}`;
  }
  $('recipeGuide').innerHTML = selectedRecipes.length ? `<h3>Recipe guide</h3><div class="card-subtitle">Ingredients and instructions for the week</div>${selectedRecipes.map(recipeGuide).join('')}` : '<h3>Recipe guide</h3><div class="shopping-empty"><strong>Recipes will show up here.</strong>Lock in a few dinners and this becomes your cooking companion.</div>';
}

function recipeGuide(recipe) {
  return `<section class="guide-recipe"><h4>${escapeHTML(recipe.title)}</h4><div class="recipe-source">${escapeHTML(recipe.source || 'Personal recipe')} · ${escapeHTML(recipe.time || 'Flexible')}</div><div class="guide-label">Ingredients</div><div class="guide-ingredients">${recipe.ingredients.map(item => `<span>${escapeHTML([formatAmount(item.amount), item.unit, item.name].filter(Boolean).join(' '))}</span>`).join('')}</div><div class="guide-label">Instructions</div><ol>${recipe.instructions.map(step => `<li>${escapeHTML(step)}</li>`).join('')}</ol><div class="guide-rate"><span>How was it?</span>${[1,2,3,4,5].map(value => `<button class="${recipe.rating >= value ? 'active' : ''}" data-action="rate" data-id="${recipe.id}" data-rating="${value}" aria-label="Rate ${value} stars">★</button>`).join('')}</div></section>`;
}

function weightedRecipe(candidates) {
  const pool = candidates.filter(isPlannerMeal);
  if (!pool.length) return null;
  const weighted = pool.flatMap(recipe => Array.from({ length: recipe.rating >= 4 ? 3 : 1 }, () => recipe));
  return weighted[Math.floor(Math.random() * weighted.length)];
}

function randomizeMeals() {
  const lockedIds = plan.slice(0, targetMeals).filter(slot => slot.locked && slot.recipeId).map(slot => slot.recipeId);
  const used = [...lockedIds];
  let changed = 0;
  plan.slice(0, targetMeals).forEach(slot => {
    if (slot.locked) return;
    let candidates = recipes.filter(recipe => isPlannerMeal(recipe) && !used.includes(recipe.id));
    if (!candidates.length) { candidates = recipes.filter(recipe => isPlannerMeal(recipe) && !lockedIds.includes(recipe.id)); }
    const pick = weightedRecipe(candidates);
    if (pick) { slot.recipeId = pick.id; slot.locked = false; used.push(pick.id); changed += 1; }
  });
  save(STORAGE.plan, plan); render(); showToast(changed ? `${changed} unlocked meal${changed === 1 ? '' : 's'} re-rolled.` : 'Lock a meal to keep it in place.');
}

function addToWeek(recipeId) {
  const recipe = getRecipe(recipeId);
  if (!isPlannerMeal(recipe)) { showToast('That recipe stays in the library — choose a lunch or dinner for the week.'); return; }
  const existingIndex = plan.slice(0, targetMeals).findIndex(slot => slot.recipeId === recipeId);
  if (existingIndex >= 0) { showToast('That recipe is already in this week.'); return; }
  const emptyIndex = plan.slice(0, targetMeals).findIndex(slot => !slot.recipeId && !slot.locked);
  if (emptyIndex < 0) { showToast('This week is full — unlock or remove a meal first.'); return; }
  plan[emptyIndex].recipeId = recipeId; plan[emptyIndex].locked = false; save(STORAGE.plan, plan); render(); showToast('Added to this week.');
}

function rateRecipe(id, rating) { const recipe = getRecipe(id); if (!recipe) return; recipe.rating = rating; save(STORAGE.recipes, recipes); const detailOpen = !$('detailModal').classList.contains('hidden'); render(); if (detailOpen) openDetails(id); showToast(`Saved ${rating} star${rating === 1 ? '' : 's'} for ${recipe.title}.`); }
async function deleteRecipe(id) {
  if (!canManageRecipes()) { showToast('Only the kitchen owner can delete recipes.'); return; }
  const recipe = getRecipe(id); if (!recipe) return;
  if (!confirm(`Delete “${recipe.title}” from the recipe library?`)) return;
  if (!LOCAL_PREVIEW && currentUser && supabaseClient) {
    const { error } = await supabaseClient.from('recipes').delete().eq('id', String(id));
    if (error) { showToast('That recipe could not be deleted from the cloud.'); return; }
  }
  recipes = recipes.filter(item => item.id !== id);
  plan = plan.map(slot => slot.recipeId === id ? { ...slot, recipeId: null, locked: false } : slot);
  delete recipeImageCache[id];
  await Promise.all([deleteRecipeImage(id), deleteRecipeSource(id)]);
  save(STORAGE.recipes, recipes);
  save(STORAGE.plan, plan);
  closeModal('detailModal');
  render();
  showToast('Recipe deleted.');
}
async function clearCloudRecipesForOwner() {
  if (LOCAL_PREVIEW || !currentUser || !supabaseClient || !canManageRecipes()) return;
  const { data: remoteRows, error: readError } = await supabaseClient.from('recipes').select('id');
  if (readError) throw readError;
  const ids = (remoteRows || []).map(row => row.id).filter(Boolean);
  if (!ids.length) return;
  const { error } = await supabaseClient.from('recipes').delete().in('id', ids);
  if (error) throw error;
}

function openDetails(id) {
  const recipe = getRecipe(id); if (!recipe) return;
  const scanLink = recipe.scanData ? `<a class="button button-light" href="${recipe.scanData}" target="_blank" rel="noreferrer">Open attached scan ↗</a>` : recipe.scanFileName ? `<span class="scan-file-meta">Attached scan: ${escapeHTML(recipe.scanFileName)}</span>` : '';
  const weekAction = isPlannerMeal(recipe) ? `<button class="button button-dark" data-action="add-week" data-id="${recipe.id}">＋ Add to week</button>` : '<span class="scan-file-meta">Library only · not a lunch/dinner meal</span>';
  const deleteAction = canManageRecipes() ? `<button class="button button-danger" data-action="delete-recipe" data-id="${recipe.id}">Delete recipe</button>` : '';
  const sourceLabel = recipe.sourceType === 'cookbook' ? 'Cookbook scan' : recipe.sourceType === 'internet' ? 'Internet recipe' : 'Typed by us';
  $('detailContent').innerHTML = `${recipeArtwork(recipe, 'detail-art')}<div class="detail-head"><h2 id="detailModalTitle">${escapeHTML(recipe.title)}</h2><span class="recipe-stars">${stars(recipe.rating)}</span></div><div class="detail-source">${escapeHTML(recipe.source || 'Personal recipe')} · ${sourceLabel} · ${escapeHTML(recipe.time || 'Flexible')}</div><div class="detail-columns"><div><h4>Ingredients</h4><ul>${recipe.ingredients.map(item => `<li>${escapeHTML([formatAmount(item.amount), item.unit, item.name].filter(Boolean).join(' '))}</li>`).join('')}</ul></div><div><h4>Instructions</h4><ol>${recipe.instructions.map(step => `<li>${escapeHTML(step)}</li>`).join('')}</ol></div></div><div class="detail-footer"><div class="rating-picker"><span>Rate this recipe</span>${[1,2,3,4,5].map(value => `<button class="${recipe.rating >= value ? 'active' : ''}" data-action="rate" data-id="${recipe.id}" data-rating="${value}">★</button>`).join('')}</div><div class="topbar-actions">${scanLink}${weekAction}${deleteAction}</div></div>`;
  openModal('detailModal');
}

function parseIngredientLines(text) { return text.split('\n').map(line => line.trim()).filter(Boolean).map(line => { const parts = line.split('|').map(part => part.trim()); if (parts.length >= 3) return { amount: parseFraction(parts[0]), unit: parts[1], name: parts.slice(2).join(' | '), category: inferCategory(parts.slice(2).join(' | ')) }; const match = line.match(/^([\d./]+)?\s*(.*)$/); return { amount: match && match[1] ? parseFraction(match[1]) : '', unit: '', name: match ? match[2] : line, category: inferCategory(line) }; }); }
function parseFraction(value) { if (!value) return ''; if (value.includes('/')) { const [a, b] = value.split('/').map(Number); return b ? a / b : value; } const numeric = Number(value); return Number.isNaN(numeric) ? value : numeric; }
function inferCategory(name) { const value = String(name || '').toLowerCase(); if (isPantrySeasoningIngredient(value)) return 'Pantry'; if (/chicken|turkey|beef|salmon|pork|ham|bacon|sausage|lamb|shrimp|tofu|cod\b|fish\b|tilapia|trout|tuna|halibut|haddock|mahi|crab|lobster|scallop|anchov|sardine|seafood/.test(value) || (/(?:ribeye|rib-eye|porterhouse|t-bone|sirloin|tenderloin|filet mignon|filet|strip steak|steaks?)/.test(value) && !/(?:seasoning|sauce)\b/.test(value))) return 'Proteins'; if (/half[- ]and[- ]half|milk|cream|cheese|parmesan|butter|yogurt|egg|swiss|fontina|gruy[eè]re|cheddar/.test(value)) return 'Dairy'; if (/salt|mustard|pepper|paprika|nutmeg|seasoning|oil|sauce|vinegar|spray/.test(value)) return 'Pantry'; if (/bread|tortilla|sourdough|phyllo/.test(value)) return 'Bakery'; if (/lemon|lime|onion|garlic|carrot|celery|broccoli|romaine|avocado|cucumber|ginger|sweet potato|spinach|parsley|dill|artichoke|kale|chive|thyme|jalape|pineapple|tomato/.test(value)) return 'Produce'; return 'Pantry'; }

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function handleRecipeSubmit(event) {
  event.preventDefault();
  const title = $('recipeTitle').value.trim();
  const sourceType = $('recipeSourceType').value;
  let cookbookId = '';
  let cookbook = null;
  if (sourceType === 'cookbook') {
    const newCookbookName = $('newCookbookName').value.trim();
    if (newCookbookName) {
      cookbook = { id: `book-${Date.now()}`, name: newCookbookName };
      cookbooks = [cookbook, ...cookbooks];
      save(STORAGE.cookbooks, cookbooks);
    } else {
      cookbook = cookbooks.find(book => book.id === $('cookbookSelect').value) || null;
    }
    cookbookId = cookbook?.id || '';
  }
  const source = $('recipeSource').value.trim() || cookbook?.name || 'Personal recipe';
  const ingredients = parseIngredientLines($('recipeIngredients').value);
  const instructions = $('recipeInstructions').value.split('\n').map(line => line.trim()).filter(Boolean);
  const scanFile = $('recipeScan').files[0];
  let scanData = '';
  if (scanFile && scanFile.size <= 3000000) {
    try { scanData = await readFileAsDataURL(scanFile); } catch {}
  }
  const newRecipe = { id: `r${Date.now()}`, ownerId: currentUser?.id || '', title, source, sourceType, cookbookId, sourceUrl: $('recipeUrl').value.trim(), imageUrl: pendingImportedImage, imageData: scanFile?.type?.startsWith('image/') ? scanData : '', rating: 0, time: $('recipeTime').value.trim() || 'Flexible', accent: ACCENTS[recipes.length % ACCENTS.length], ingredients, instructions, scanFileName: scanFile?.name || '', scanData };
  recipes = [newRecipe, ...recipes];
  try { save(STORAGE.recipes, recipes); } catch { newRecipe.scanData = ''; newRecipe.imageData = ''; save(STORAGE.recipes, recipes); showToast('Recipe saved; the scan was too large to keep in this browser.'); }
  $('recipeForm').reset(); $('recipeScanName').textContent = 'No file attached'; closeModal('recipeModal'); activeView = 'library'; render(); showToast(scanData ? 'Recipe and scan added to your collection.' : 'Recipe added to your collection.');
}

function emailShoppingItems() {
  return aggregateIngredients().filter(item => !checkedItems[item.key]);
}
function shoppingText() {
  const items = emailShoppingItems();
  const selectedRecipes = plan.slice(0, targetMeals).map(slot => getRecipe(slot.recipeId)).filter(Boolean);
  let text = `LADLE · WEEK OF AUGUST 3–9\n\nSHOPPING LIST\n`;
  if (!items.length) text += 'Everything is already marked as on hand.\n';
  const byCategory = items.reduce((acc, item) => { (acc[item.category || 'Other'] ||= []).push(item); return acc; }, {});
  Object.entries(byCategory).forEach(([category, group]) => {
    text += `\n${category.toUpperCase()}\n`;
    group.forEach(item => { const amount = shoppingAmountLabel(item); text += `□ ${amount} ${item.name}\n`; });
  });
  text += '\n\nRECIPES\n';
  selectedRecipes.forEach(recipe => {
    text += `\n${recipe.title.toUpperCase()} · ${recipe.source}\nIngredients: ${recipe.ingredients.map(item => [formatAmount(item.amount), item.unit, item.name].filter(Boolean).join(' ')).join(', ')}\nInstructions:\n${recipe.instructions.map((step, index) => `${index + 1}. ${step}`).join('\n')}\n`;
  });
  return text;
}
const MAILTO_MAX_LENGTH = 12000;
function asciiMailText(value) {
  return String(value || '')
    .replace(/¼/g, '1/4').replace(/½/g, '1/2').replace(/¾/g, '3/4').replace(/⅓/g, '1/3').replace(/⅔/g, '2/3').replace(/⅛/g, '1/8').replace(/⅜/g, '3/8').replace(/⅝/g, '5/8').replace(/⅞/g, '7/8')
    .replace(/[–—−·]/g, '-').replace(/□/g, '-').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}
function compactMailText(mode = 'full') {
  const items = emailShoppingItems();
  const selectedRecipes = plan.slice(0, targetMeals).map(slot => getRecipe(slot.recipeId)).filter(Boolean);
  let text = 'LADLE - WEEK OF AUGUST 3-9\n\nSHOPPING LIST\n';
  if (!items.length) text += 'Everything is already marked as on hand.\n';
  const byCategory = items.reduce((acc, item) => { (acc[item.category || 'Other'] ||= []).push(item); return acc; }, {});
  Object.entries(byCategory).forEach(([category, group]) => {
    text += '\n' + category.toUpperCase() + '\n';
    group.forEach(item => { text += '- ' + shoppingAmountLabel(item).replace(/\n/g, ' ') + ' ' + item.name + '\n'; });
  });
  if (mode !== 'list') {
    text += '\nRECIPES\n';
    selectedRecipes.forEach(recipe => {
      text += '\n' + recipe.title + '\n';
      if (mode !== 'titles') {
        const ingredients = recipe.ingredients.map(item => [formatAmount(item.amount), item.unit, item.name].filter(Boolean).join(' ').replace(/\s+/g, ' ')).join('; ');
        text += 'Ingredients: ' + ingredients + '\n';
      }
      if (mode === 'full') text += 'Directions: ' + recipe.instructions.map((step, index) => (index + 1) + ') ' + String(step).replace(/\s+/g, ' ').trim()).join(' ') + '\n';
    });
  }
  return asciiMailText(text);
}
function selectMailBody(recipient, subject) {
  const candidates = [shoppingText(), compactMailText('full'), compactMailText('ingredients'), compactMailText('titles'), compactMailText('list')];
  return candidates.find(body => ('mailto:' + recipient + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body)).length <= MAILTO_MAX_LENGTH) || '';
}
function emailPreviewMarkup() {
  const allItems = aggregateIngredients();
  const items = allItems.filter(item => !checkedItems[item.key]);
  const selectedRecipes = plan.slice(0, targetMeals).map(slot => getRecipe(slot.recipeId)).filter(Boolean);
  const byCategory = items.reduce((acc, item) => { (acc[item.category || 'Other'] ||= []).push(item); return acc; }, {});
  const shoppingMarkup = items.length ? Object.entries(byCategory).map(([category, group]) => `<div class="shopping-group"><h4>${escapeHTML(category)}</h4>${group.map(item => { const amount = shoppingAmountLabel(item); return `<label class="shopping-item"><input type="checkbox" disabled /><span class="shopping-amount">${escapeHTML(amount)}</span><span class="shopping-name">${escapeHTML(item.name)}</span></label>`; }).join('')}</div>`).join('') : `<div class="shopping-empty">${allItems.length ? 'Everything is already marked as on hand.' : 'Choose meals to build this list.'}</div>`;
  const recipesMarkup = selectedRecipes.length ? selectedRecipes.map(recipe => `<section class="email-preview-recipe"><h5>${escapeHTML(recipe.title)}</h5><div class="recipe-source">${escapeHTML(recipe.source || 'Personal recipe')} · ${escapeHTML(recipe.time || 'Flexible')}</div><p><strong>Ingredients:</strong> ${recipe.ingredients.map(item => escapeHTML([formatAmount(item.amount), item.unit, item.name].filter(Boolean).join(' '))).join(', ')}</p><ol>${recipe.instructions.map(step => `<li>${escapeHTML(step)}</li>`).join('')}</ol></section>`).join('') : '<div class="shopping-empty">Choose meals to include their recipes here.</div>';
  return `<div class="email-preview-shell"><header class="email-preview-header"><div class="eyebrow">LADLE · WEEK OF AUGUST 3–9</div><h3>Everything for the good part.</h3><p>${selectedRecipes.length} recipes · ${items.length} consolidated ingredients</p></header><div class="email-preview-body"><section class="email-preview-section"><h4>Shopping list</h4>${shoppingMarkup}</section><section class="email-preview-section"><h4>Recipe guide</h4>${recipesMarkup}</section></div></div>`;
}
function renderEmailPreview() { $('emailPreviewContent').innerHTML = emailPreviewMarkup(); }
function generateStandaloneEmail() {
  const body = emailPreviewMarkup().replace('<div class="email-preview-shell">', '<style>.shopping-amount{white-space:pre-line;line-height:1.2}</style><div class="email-preview-shell">');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Ladle · Week of August 3–9</title><style>body{margin:0;padding:32px;background:#f7f4ed;color:#23302a;font-family:Arial,sans-serif}.email-preview-shell{max-width:900px;margin:0 auto;border:1px solid #e6e5db;border-radius:14px;overflow:hidden;background:#fffdf8}.email-preview-header{background:#dfe9d8;padding:28px}.eyebrow{font-size:11px;letter-spacing:.14em;color:#5f765e;font-weight:bold}.email-preview-header h3{font:700 34px Georgia,serif;margin:10px 0 6px}.email-preview-header p{color:#657361;font-size:13px}.email-preview-body{padding:20px;display:grid;grid-template-columns:.9fr 1.1fr;gap:16px}.email-preview-section{border:1px solid #e6e5db;border-radius:11px;padding:18px}.email-preview-section h4{font:700 22px Georgia,serif;margin:0 0 14px}.shopping-group{margin:15px 0}.shopping-group h4{font:700 11px Arial,sans-serif;letter-spacing:.13em;text-transform:uppercase;color:#c87d5e}.shopping-item{display:flex;gap:9px;align-items:center;padding:8px 0;border-bottom:1px solid #f0eee8;font-size:12px}.shopping-amount{min-width:65px;color:#5f765e;font-weight:bold}.shopping-name{flex:1}.email-preview-recipe{border-top:1px solid #e6e5db;padding:13px 0}.email-preview-recipe:first-child{border-top:0;padding-top:0}.email-preview-recipe h5{font:700 18px Georgia,serif;margin:0 0 4px}.recipe-source{font-size:11px;color:#7e877e}.email-preview-recipe p,.email-preview-recipe ol{font-size:12px;line-height:1.5;color:#707970}.shopping-empty{padding:24px 8px;color:#7e877e;font-size:12px}@media(max-width:700px){.email-preview-body{display:block}.email-preview-section{margin-bottom:16px}}</style></head><body>${body}</body></html>`;
}
function downloadEmailHtml() {
  const blob = new Blob([generateStandaloneEmail()], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'ladle-week-of-august-3.html';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast('Styled HTML email downloaded.');
}
function downloadEmailEml(message = '') {
  const recipient = $('emailRecipient').value.trim().replace(/[\r\n]/g, '');
  if (!recipient) { $('emailRecipient').focus(); showToast('Enter an email address first.'); return; }
  const subject = 'Ladle · Week of August 3–9';
  const eml = [
    `To: ${recipient}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    generateStandaloneEmail()
  ].join('\r\n');
  const blob = new Blob([eml], { type: 'message/rfc822' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'ladle-week-of-august-3.eml';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast(message || 'Mail file downloaded — double-click it to open in Mail.');
}
function prepareMailAppLink() {
  const link = $('openMailApp');
  if (!link) return;
  const recipient = $('emailRecipient').value.trim().replace(/[\r\n]/g, '');
  if (!recipient) { link.href = '#'; link.dataset.mailState = 'missing'; return; }
  const subject = 'Ladle · Week of August 3–9';
  const body = selectMailBody(recipient, subject);
  if (!body) { link.href = '#'; link.dataset.mailState = 'fallback'; return; }
  link.href = 'mailto:' + recipient + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
  link.dataset.mailState = 'ready';
}
function openMailApp(event) {
  const link = event.currentTarget;
  prepareMailAppLink();
  if (link.dataset.mailState === 'missing') {
    event.preventDefault();
    $('emailRecipient').focus();
    showToast('Enter an email address first.');
    return;
  }
  if (link.dataset.mailState === 'fallback') {
    event.preventDefault();
    showToast('This week is too large for a native Mail link. Open the app in Safari or Chrome to email it.');
    return;
  }
  if (window.location.protocol === 'file:') {
    event.preventDefault();
    showToast('Direct Mail is blocked in this embedded browser. Open this page in Safari or Chrome to email it.');
    return;
  }
  showToast('Opening Mail…');
}
async function copyEmailBody() {
  try { await navigator.clipboard.writeText(shoppingText()); showToast('Email body copied to the clipboard.'); }
  catch { showToast('Copy failed — use Download HTML instead.'); }
}
function emailShopping() { renderEmailPreview(); prepareMailAppLink(); openModal('emailPreviewModal'); }

document.addEventListener('click', event => {
  const nav = event.target.closest('[data-view]'); if (nav) { activeView = nav.dataset.view; render(); return; }
  const jump = event.target.closest('[data-view-jump]'); if (jump) { activeView = jump.dataset.viewJump; render(); return; }
  const action = event.target.closest('[data-action]');
  if (action) { const type = action.dataset.action; if (type === 'details') openDetails(action.dataset.id); if (type === 'add-week') { addToWeek(action.dataset.id); if (!$('detailModal').classList.contains('hidden')) closeModal('detailModal'); } if (type === 'toggle-lock') { const slot = plan[Number(action.dataset.index)]; if (slot) { slot.locked = !slot.locked; save(STORAGE.plan, plan); render(); showToast(slot.locked ? 'Meal locked in.' : 'Meal unlocked.'); } } if (type === 'remove-week') { const slot = plan[Number(action.dataset.index)]; if (slot) { slot.recipeId = null; slot.locked = false; save(STORAGE.plan, plan); render(); showToast('Meal removed from the week.'); } } if (type === 'rate') rateRecipe(action.dataset.id, Number(action.dataset.rating)); if (type === 'delete-recipe') deleteRecipe(action.dataset.id); return; }
  const closer = event.target.closest('[data-close-modal]'); if (closer) closeModal(closer.dataset.closeModal);
});

document.querySelectorAll('.nav-item').forEach(button => button.addEventListener('click', () => { activeView = button.dataset.view; render(); }));
$('openImport').addEventListener('click', () => openRecipeModal('manual'));
$('openCookbookScan').addEventListener('click', openBulkCookbookModal);
$('emptyAddRecipe').addEventListener('click', () => openRecipeModal('manual'));
$('recipeForm').addEventListener('submit', handleRecipeSubmit);
$('recipeSourceType').addEventListener('change', syncImportMode);
$('importLink').addEventListener('click', importRecipeFromLink);
$('readScan').addEventListener('click', readCookbookScan);
$('readBulkCookbook').addEventListener('click', readBulkCookbookPDF);
$('importBulkRecipes').addEventListener('click', importBulkRecipes);
$('recipeScan').addEventListener('change', event => { const file = event.target.files[0]; $('recipeScanName').textContent = file?.name || 'No file attached'; $('readScan').classList.toggle('hidden', !file || file.type === 'application/pdf'); $('scanUpload').classList.remove('hidden'); });
$('librarySearch').addEventListener('input', renderLibrary); $('sourceFilter').addEventListener('change', renderLibrary); $('ratingFilter').addEventListener('change', renderLibrary);
$('clearFilters').addEventListener('click', () => { $('librarySearch').value = ''; $('sourceFilter').value = 'all'; $('ratingFilter').value = 'all'; renderLibrary(); });
$('mealCount').addEventListener('change', event => { targetMeals = Number(event.target.value); save(STORAGE.target, targetMeals); render(); });
$('randomizeMeals').addEventListener('click', randomizeMeals);
$('openPlannerSearch').addEventListener('click', () => { $('plannerSearchPanel').classList.remove('hidden'); $('plannerSearch').focus(); renderPlannerSearch(); });
$('closePlannerSearch').addEventListener('click', () => $('plannerSearchPanel').classList.add('hidden'));
$('plannerSearch').addEventListener('input', renderPlannerSearch);
$('copyShopping').addEventListener('click', async () => { try { await navigator.clipboard.writeText(shoppingText()); showToast('Shopping list copied — ready for Walmart.'); } catch { showToast('Select the list text to copy it.'); } });
$('printShopping').addEventListener('click', () => window.print());
$('emailShopping').addEventListener('click', emailShopping);
$('downloadEmailHtml').addEventListener('click', downloadEmailHtml);
$('downloadEmailEml').addEventListener('click', downloadEmailEml);
$('openMailApp').addEventListener('click', openMailApp);
$('copyEmailBody').addEventListener('click', copyEmailBody);
$('authForm').addEventListener('submit', requestMagicLink);
$('profileButton').addEventListener('click', signOutUser);
$('emailRecipient').value = load(STORAGE.email, ''); $('emailRecipient').addEventListener('input', prepareMailAppLink); $('emailRecipient').addEventListener('change', event => { save(STORAGE.email, event.target.value); prepareMailAppLink(); });
$('resetDemo').addEventListener('click', async () => { if (!canManageRecipes()) { showToast('Only the kitchen owner can clear the recipe library.'); return; } if (!confirm('Clear all saved recipes and this week’s plan?')) return; try { await clearCloudRecipesForOwner(); } catch { showToast('The cloud library could not be cleared.'); return; } recipes = []; plan = DAYS.map(day => ({ day, recipeId: null, locked: false })); targetMeals = 5; checkedItems = {}; ['recipes', 'plan', 'target', 'checked'].forEach(key => localStorage.removeItem(STORAGE[key])); save(STORAGE.recipes, recipes); save(STORAGE.plan, plan); save(STORAGE.target, targetMeals); save(STORAGE.checked, checkedItems); await Promise.all([clearRecipeImages(), clearRecipeSources()]); render(); showToast('Recipe library cleared.'); });
document.addEventListener('change', event => { if (!event.target.matches('[data-shopping-key]')) return; const key = event.target.dataset.shoppingKey; checkedItems[key] = event.target.checked; save(STORAGE.checked, checkedItems); event.target.closest('.shopping-item').classList.toggle('checked', event.target.checked); renderEmailPreview(); });
window.addEventListener('storage', event => {
  if (event.key === STORAGE.recipes || event.key === null) recipes = load(STORAGE.recipes, []);
  if (event.key === STORAGE.plan || event.key === null) plan = load(STORAGE.plan, DAYS.map(day => ({ day, recipeId: null, locked: false })));
  if (event.key === STORAGE.target || event.key === null) targetMeals = Number(load(STORAGE.target, 5));
  if (event.key === STORAGE.checked || event.key === null) checkedItems = load(STORAGE.checked, {});
  if (event.key === STORAGE.cookbooks || event.key === null) cookbooks = load(STORAGE.cookbooks, seedCookbooks);
  if ([STORAGE.recipes, STORAGE.plan, STORAGE.target, STORAGE.checked, STORAGE.cookbooks, null].includes(event.key)) { renderCookbookOptions(); render(); }
});
document.addEventListener('keydown', event => { if (event.key === 'Escape') document.querySelectorAll('.modal-backdrop:not(.hidden)').forEach(modal => closeModal(modal.id)); });

render();
renderCookbookOptions();
syncImportMode();
if (shouldClearForReimport || shouldClearLibraryForReimport) Promise.all([clearRecipeImages(), clearRecipeSources()]).then(() => render());
else Promise.all([hydrateRecipeImages(), hydrateRecipeSources()]);
initializeCloudAuth();
