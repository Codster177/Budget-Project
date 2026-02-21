import { useState, useEffect } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog'
import { GripVertical, Plus, X } from 'lucide-react'

function SortableItem({ id, onRemove }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 10 : 'auto'
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 px-2 py-1.5 rounded bg-background hover:bg-muted/40 transition-colors"
    >
      {/* Drag handle */}
      <button
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none shrink-0"
        {...attributes}
        {...listeners}
        tabIndex={-1}
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <span className="flex-1 text-sm select-none">{id}</span>

      <button
        onClick={() => onRemove(id)}
        className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
        aria-label={`Remove ${id}`}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </li>
  )
}

function CategoryList({ title, items, onChange }) {
  const [draft, setDraft] = useState('')

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function handleDragEnd(event) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIndex = items.indexOf(active.id)
      const newIndex = items.indexOf(over.id)
      onChange(arrayMove(items, oldIndex, newIndex))
    }
  }

  function handleAdd() {
    const trimmed = draft.trim()
    if (!trimmed || items.includes(trimmed)) return
    onChange([...items, trimmed])
    setDraft('')
  }

  function handleRemove(item) {
    onChange(items.filter(i => i !== item))
  }

  return (
    <div className="flex-1 min-w-0">
      <h3 className="text-sm font-semibold mb-2">{title}</h3>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={items} strategy={verticalListSortingStrategy}>
          <ul className="space-y-1 mb-3 max-h-52 overflow-y-auto rounded-md border border-border p-2">
            {items.length === 0 && (
              <li className="text-muted-foreground text-sm text-center py-2">No categories</li>
            )}
            {items.map(item => (
              <SortableItem key={item} id={item} onRemove={handleRemove} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      <div className="flex gap-2">
        <Input
          placeholder="New category…"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          className="h-8 text-sm"
        />
        <Button size="icon" variant="outline" className="h-8 w-8 shrink-0" onClick={handleAdd}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

export default function CategoriesModal({ open, onOpenChange, categories, onSaved }) {
  const [inCats, setInCats] = useState([])
  const [outCats, setOutCats] = useState([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setInCats([...categories.categoriesIn])
      setOutCats([...categories.categoriesOut])
    }
  }, [open, categories])

  async function handleSave() {
    setSaving(true)
    await window.api.saveCategories({
      categoriesIn: inCats,
      categoriesOut: outCats,
      jsonPath: categories.jsonPath
    })
    setSaving(false)
    onSaved({ ...categories, categoriesIn: inCats, categoriesOut: outCats })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit Categories</DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground -mt-1">
          Drag rows to reorder — order is reflected in the year chart.
        </p>

        <div className="flex gap-6 py-2">
          <CategoryList
            title="Income Categories"
            items={inCats}
            onChange={setInCats}
          />
          <div className="w-px bg-border" />
          <CategoryList
            title="Expense Categories"
            items={outCats}
            onChange={setOutCats}
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save Categories'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
