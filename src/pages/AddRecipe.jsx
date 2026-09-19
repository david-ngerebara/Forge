import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Sparkles, Plus, Trash2, Link as LinkIcon, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function AddRecipe() {
  const navigate = useNavigate();
  const [mode, setMode] = useState('manual');
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);
  const [recipe, setRecipe] = useState({
    title: '', image_url: '', servings: 1, prep_time_min: 0, cook_time_min: 0,
    ingredients: [{ name: '', quantity: 1, unit: '' }], instructions: [''],
    nutrition: { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }, nutrition_estimated: false, dietary_tags: [],
  });
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setRecipe(r => ({ ...r, [k]: v }));
  const setN = (k, v) => setRecipe(r => ({ ...r, nutrition: { ...r.nutrition, [k]: +v || 0 } }));

  const doImport = async () => {
    if (!importText.trim()) return;
    setImporting(true);
    try {
      const isUrl = /^https?:\/\//.test(importText.trim());
      const { data: res, error: fnError } = await supabase.functions.invoke('import-recipe', {
        body: isUrl ? { sourceUrl: importText.trim() } : { text: importText },
      });
      if (fnError) throw fnError;
      const imp = res?.recipe;
      if (imp) {
        setRecipe({
          title: imp.title || '', image_url: '', servings: imp.servings || 1, prep_time_min: imp.prep_time_min || 0, cook_time_min: imp.cook_time_min || 0,
          ingredients: (imp.ingredients || []).map(i => ({ name: i.name, quantity: i.quantity || 1, unit: i.unit || '', category: i.category || '' })),
          instructions: imp.instructions || [''], nutrition: imp.nutrition || { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
          nutrition_estimated: imp.nutrition_estimated || false, dietary_tags: imp.dietary_tags || [], source: isUrl ? 'url' : 'text', source_url: isUrl ? importText.trim() : '',
        });
        if (imp.allergy_warning) alert('Allergy warning: ' + imp.allergy_warning);
        setMode('manual');
      } else { alert(res?.error || 'Import failed'); }
    } catch (e) { alert(e.message); }
    finally { setImporting(false); }
  };

  const save = async () => {
    if (!recipe.title) { alert('Add a title'); return; }
    setSaving(true);
    try {
      const clean = { ...recipe, ingredients: recipe.ingredients.filter(i => i.name), instructions: recipe.instructions.filter(s => s.trim()) };
      const { error } = await supabase.from('recipes').insert(clean);
      if (error) throw error;
      navigate('/recipes');
    } catch (e) { alert(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/recipes')} className="w-9 h-9 rounded-lg border border-border flex items-center justify-center"><ArrowLeft className="w-4 h-4" /></button>
        <h1 className="text-2xl font-bold font-heading">Add recipe</h1>
      </div>

      <div className="flex gap-1 p-1 bg-muted rounded-xl">
        {[['manual', 'Manual'], ['import', 'AI Import']].map(([k, l]) => (
          <button key={k} onClick={() => setMode(k)} className={cn('flex-1 py-2 rounded-lg text-sm font-semibold', mode === k ? 'bg-card shadow-sm' : 'text-muted-foreground')}>{l}</button>
        ))}
      </div>

      {mode === 'import' && (
        <div className="rounded-2xl bg-card border border-border p-4 space-y-3">
          <div className="flex items-center gap-2 text-primary"><Sparkles className="w-5 h-5" /><p className="font-semibold text-sm">Paste recipe text or a URL</p></div>
          <textarea value={importText} onChange={e => setImportText(e.target.value)} placeholder="Paste a recipe URL or the full recipe text here..." className="w-full min-h-32 rounded-xl border border-input bg-background p-3 text-sm resize-none" />
          <Button onClick={doImport} disabled={importing || !importText} className="w-full rounded-xl h-12 font-semibold"><Sparkles className="w-4 h-4 mr-1.5" /> {importing ? 'Extracting...' : 'Extract recipe'}</Button>
          <p className="text-xs text-muted-foreground">We extract title, ingredients, instructions, and nutrition. Nutrition is labeled as an estimate when not explicitly provided.</p>
        </div>
      )}

      {mode === 'manual' && (
        <div className="space-y-4">
          <div><Label>Title</Label><Input value={recipe.title} onChange={e => set('title', e.target.value)} placeholder="Recipe name" className="mt-1.5" /></div>
          <div><Label>Image URL (optional)</Label><Input value={recipe.image_url} onChange={e => set('image_url', e.target.value)} placeholder="https://..." className="mt-1.5" /></div>
          <div className="grid grid-cols-3 gap-2">
            <div><Label>Servings</Label><Input type="number" value={recipe.servings} onChange={e => set('servings', +e.target.value || 1)} className="mt-1.5" /></div>
            <div><Label>Prep min</Label><Input type="number" value={recipe.prep_time_min} onChange={e => set('prep_time_min', +e.target.value || 0)} className="mt-1.5" /></div>
            <div><Label>Cook min</Label><Input type="number" value={recipe.cook_time_min} onChange={e => set('cook_time_min', +e.target.value || 0)} className="mt-1.5" /></div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2"><Label>Ingredients</Label><button onClick={() => set('ingredients', [...recipe.ingredients, { name: '', quantity: 1, unit: '' }])} className="text-primary text-sm font-semibold flex items-center"><Plus className="w-4 h-4" /> Add</button></div>
            {recipe.ingredients.map((ing, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <Input value={ing.name} onChange={e => { const a = [...recipe.ingredients]; a[i].name = e.target.value; set('ingredients', a); }} placeholder="Ingredient" className="flex-1" />
                <Input type="number" value={ing.quantity} onChange={e => { const a = [...recipe.ingredients]; a[i].quantity = +e.target.value || 0; set('ingredients', a); }} placeholder="Qty" className="w-16" />
                <Input value={ing.unit} onChange={e => { const a = [...recipe.ingredients]; a[i].unit = e.target.value; set('ingredients', a); }} placeholder="cup" className="w-20" />
                <button onClick={() => set('ingredients', recipe.ingredients.filter((_, x) => x !== i))} className="text-muted-foreground px-1"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>

          <div>
            <div className="flex justify-between items-center mb-2"><Label>Instructions</Label><button onClick={() => set('instructions', [...recipe.instructions, ''])} className="text-primary text-sm font-semibold flex items-center"><Plus className="w-4 h-4" /> Add</button></div>
            {recipe.instructions.map((step, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center flex-shrink-0 mt-2">{i + 1}</span>
                <textarea value={step} onChange={e => { const a = [...recipe.instructions]; a[i] = e.target.value; set('instructions', a); }} placeholder="Step..." className="flex-1 min-h-10 rounded-lg border border-input bg-background p-2 text-sm resize-none" />
                <button onClick={() => set('instructions', recipe.instructions.filter((_, x) => x !== i))} className="text-muted-foreground px-1 mt-2"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>

          <div>
            <Label>Nutrition per serving (optional)</Label>
            <div className="grid grid-cols-4 gap-2 mt-1.5">
              <Input type="number" placeholder="Cal" value={recipe.nutrition.calories} onChange={e => setN('calories', e.target.value)} />
              <Input type="number" placeholder="Protein" value={recipe.nutrition.protein} onChange={e => setN('protein', e.target.value)} />
              <Input type="number" placeholder="Carbs" value={recipe.nutrition.carbs} onChange={e => setN('carbs', e.target.value)} />
              <Input type="number" placeholder="Fat" value={recipe.nutrition.fat} onChange={e => setN('fat', e.target.value)} />
            </div>
          </div>

          <Button onClick={save} disabled={saving} className="w-full rounded-xl h-12 font-semibold">{saving ? 'Saving...' : 'Save recipe'}</Button>
        </div>
      )}
    </div>
  );
}