import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Search, Clock, Flame, BookOpen, FolderPlus } from 'lucide-react';

export default function Recipes() {
  const navigate = useNavigate();
  const [recipes, setRecipes] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('recipes').select('*').order('created_at', { ascending: false }).limit(100).then(({ data }) => { setRecipes(data || []); setLoading(false); });
  }, []);

  const filtered = recipes.filter(r => r.title?.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-heading">Recipes</h1>
          <p className="text-sm text-muted-foreground">Your saved meals</p>
        </div>
        <Button onClick={() => navigate('/recipes/new')} size="sm" className="rounded-xl"><Plus className="w-4 h-4 mr-1" /> Add</Button>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search recipes..." value={query} onChange={e => setQuery(e.target.value)} className="pl-9 rounded-xl" />
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="font-medium">{recipes.length === 0 ? 'No recipes yet' : 'No matches'}</p>
          <p className="text-sm">{recipes.length === 0 ? 'Add one manually or import with AI' : 'Try a different search'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {filtered.map(r => (
            <button key={r.id} onClick={() => navigate(`/recipes/${r.id}`)} className="text-left rounded-2xl bg-card border border-border overflow-hidden active:scale-[0.98] transition">
              <div className="aspect-[4/3] bg-muted">
                {r.image_url ? <img src={r.image_url} alt={r.title} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><BookOpen className="w-8 h-8 text-muted-foreground/40" /></div>}
              </div>
              <div className="p-3">
                <p className="font-semibold text-sm leading-tight line-clamp-2">{r.title}</p>
                <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted-foreground">
                  {r.nutrition?.calories > 0 && <span className="flex items-center gap-0.5"><Flame className="w-3 h-3" />{r.nutrition.calories}</span>}
                  <span className="flex items-center gap-0.5"><Clock className="w-3 h-3" />{(r.prep_time_min || 0) + (r.cook_time_min || 0)}m</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}