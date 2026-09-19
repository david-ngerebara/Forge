import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Clock, Flame, Users, AlertTriangle, ShoppingCart, Minus, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function RecipeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [recipe, setRecipe] = useState(null);
  const [servings, setServings] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('recipes').select('*').eq('id', id).maybeSingle().then(({ data: r }) => { setRecipe(r); setServings(r?.servings || 1); setLoading(false); });
  }, [id]);

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" /></div>;
  if (!recipe) return <p className="text-center py-20 text-muted-foreground">Recipe not found</p>;

  const factor = servings / (recipe.servings || 1);
  const n = recipe.nutrition || {};
  const scaledN = {
    calories: Math.round((n.calories || 0) * factor),
    protein: Math.round((n.protein || 0) * factor * 10) / 10,
    carbs: Math.round((n.carbs || 0) * factor * 10) / 10,
    fat: Math.round((n.fat || 0) * factor * 10) / 10,
    fiber: Math.round((n.fiber || 0) * factor * 10) / 10,
  };

  const addToGrocery = async () => {
    const items = (recipe.ingredients || []).map(i => ({ name: i.name, category: guessCategory(i.name), quantity: `${roundQty((i.quantity || 0) * factor)} ${i.unit || ''}`.trim(), checked: false, source: 'recipe' }));
    if (items.length) await supabase.from('grocery_items').insert(items);
    alert('Ingredients added to your grocery list');
  };

  const logAsFood = async () => {
    await supabase.from('food_logs').insert({
      date: new Date().toISOString().slice(0, 10), meal_type: 'snack',
      food_name: `${recipe.title} (${servings} serv)`, serving_size: `${servings} serving${servings > 1 ? 's' : ''}`, servings: 1,
      calories: scaledN.calories, protein: scaledN.protein, carbs: scaledN.carbs, fat: scaledN.fat, fiber: scaledN.fiber, recipe_id: recipe.id
    });
    alert('Logged to your food diary');
  };

  return (
    <div className="space-y-4 -mx-4">
      <div className="relative aspect-[16/10] bg-muted">
        {recipe.image_url ? <img src={recipe.image_url} alt={recipe.title} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Flame className="w-12 h-12 text-muted-foreground/30" /></div>}
        <button onClick={() => navigate('/recipes')} className="absolute top-4 left-4 w-9 h-9 rounded-full bg-black/40 backdrop-blur text-white flex items-center justify-center"><ArrowLeft className="w-4 h-4" /></button>
      </div>

      <div className="px-4 space-y-4">
        <div>
          <h1 className="text-2xl font-bold font-heading">{recipe.title}</h1>
          <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
            {n.calories > 0 && <span className="flex items-center gap-1"><Flame className="w-4 h-4" /> {scaledN.calories} kcal</span>}
            <span className="flex items-center gap-1"><Clock className="w-4 h-4" /> {(recipe.prep_time_min || 0) + (recipe.cook_time_min || 0)} min</span>
            <span className="flex items-center gap-1"><Users className="w-4 h-4" /> {recipe.servings} serv</span>
          </div>
        </div>

        {recipe.nutrition_estimated && (
          <div className="flex items-start gap-2 p-3 rounded-xl forge-warn text-xs">
            <AlertTriangle className="w-4 h-4 text-amber-300 flex-shrink-0 mt-0.5" />
            <p className="text-amber-300">Nutrition is an estimate — not verified from a database.</p>
          </div>
        )}

        {/* Serving scaler */}
        <div className="rounded-2xl bg-card border border-border p-4 flex items-center justify-between">
          <div><p className="font-semibold text-sm">Servings</p><p className="text-xs text-muted-foreground">Scale ingredients automatically</p></div>
          <div className="flex items-center gap-3">
            <button onClick={() => setServings(s => Math.max(1, s - 1))} className="w-9 h-9 rounded-lg border border-border flex items-center justify-center"><Minus className="w-4 h-4" /></button>
            <span className="font-bold text-lg w-6 text-center">{servings}</span>
            <button onClick={() => setServings(s => s + 1)} className="w-9 h-9 rounded-lg border border-border flex items-center justify-center"><Plus className="w-4 h-4" /></button>
          </div>
        </div>

        {/* Nutrition */}
        {n.calories > 0 && (
          <div className="grid grid-cols-4 gap-2">
            {[['Cal', scaledN.calories], ['Protein', `${scaledN.protein}g`], ['Carbs', `${scaledN.carbs}g`], ['Fat', `${scaledN.fat}g`]].map(([l, v]) => (
              <div key={l} className="rounded-xl bg-card border border-border p-3 text-center"><p className="font-bold">{v}</p><p className="text-[10px] text-muted-foreground">{l}</p></div>
            ))}
          </div>
        )}

        {/* Ingredients */}
        <div className="rounded-2xl bg-card border border-border p-4">
          <h3 className="font-bold mb-3">Ingredients</h3>
          <ul className="space-y-2">
            {(recipe.ingredients || []).map((i, idx) => (
              <li key={idx} className="flex justify-between text-sm py-1.5 border-b border-border last:border-0">
                <span>{i.name}</span>
                <span className="text-muted-foreground">{roundQty((i.quantity || 0) * factor)} {i.unit}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Instructions */}
        <div className="rounded-2xl bg-card border border-border p-4">
          <h3 className="font-bold mb-3">Instructions</h3>
          <ol className="space-y-3">
            {(recipe.instructions || []).map((step, idx) => (
              <li key={idx} className="flex gap-3 text-sm">
                <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center flex-shrink-0">{idx + 1}</span>
                <span className="pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
        </div>

        {recipe.dietary_tags?.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {recipe.dietary_tags.map(t => <span key={t} className="text-xs bg-accent text-accent-foreground px-2.5 py-1 rounded-full font-medium">{t}</span>)}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Button onClick={addToGrocery} variant="outline" className="rounded-xl h-12"><ShoppingCart className="w-4 h-4 mr-1.5" /> Add to grocery</Button>
          <Button onClick={logAsFood} className="rounded-xl h-12"><Flame className="w-4 h-4 mr-1.5" /> Log this meal</Button>
        </div>

        <Button onClick={async () => { await supabase.from('recipes').delete().eq('id', recipe.id); navigate('/recipes'); }} variant="ghost" className="w-full text-destructive rounded-xl"><Trash2 className="w-4 h-4 mr-1.5" /> Delete recipe</Button>
      </div>
    </div>
  );
}

function roundQty(q) { return q >= 10 ? Math.round(q) : Math.round(q * 4) / 4; }
function guessCategory(name) {
  const n = (name || '').toLowerCase();
  if (/(chicken|beef|turkey|fish|salmon|tuna|pork|egg|tofu|shrimp|meat)/.test(n)) return 'meat_protein';
  if (/(milk|cheese|yogurt|cream|butter)/.test(n)) return 'dairy';
  if (/(rice|oat|bread|pasta|flour|quinoa)/.test(n)) return 'grains';
  if (/(spinach|apple|banana|tomato|onion|garlic|lettuce|carrot|pepper|lemon|avocado|broccoli)/.test(n)) return 'produce';
  return 'pantry';
}