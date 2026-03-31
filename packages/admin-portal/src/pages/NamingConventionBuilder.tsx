import React, { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { toast } from 'sonner';
import { SegmentType } from '@media-buying-governance/shared';
import { useCreateNamingTemplate } from '@/hooks/useApi';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Plus,
  Trash2,
  GripVertical,
  Save,
  Loader2,
  Check,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/** Segment form data */
interface SegmentData {
  id: string;
  label: string;
  type: SegmentType;
  separator: string;
  required: boolean;
  allowedValues: string[];
  pattern: string;
  format: string;
  autoGenerator: 'uuid_short' | 'sequential' | 'hash' | '';
}

const segmentTypeLabels: Record<string, string> = {
  [SegmentType.ENUM]: 'Enum (pick from list)',
  [SegmentType.FREE_TEXT]: 'Free Text',
  [SegmentType.DATE]: 'Date',
  [SegmentType.AUTO_GENERATED]: 'Auto Generated',
};

/** Generate a unique ID */
function generateId(): string {
  return `seg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Create a default segment */
function createDefaultSegment(): SegmentData {
  return {
    id: generateId(),
    label: '',
    type: SegmentType.FREE_TEXT,
    separator: '_',
    required: true,
    allowedValues: [],
    pattern: '',
    format: '',
    autoGenerator: '',
  };
}

/** Generate sample value for a segment */
function getSampleValue(seg: SegmentData): string {
  switch (seg.type) {
    case SegmentType.ENUM:
      return seg.allowedValues.length > 0 ? seg.allowedValues[0] : 'VALUE';
    case SegmentType.FREE_TEXT:
      return seg.label.replace(/\s+/g, '').toLowerCase() || 'text';
    case SegmentType.DATE:
      return seg.format === 'YYYYMMDD' ? '20260207' : '2026-02-07';
    case SegmentType.AUTO_GENERATED:
      return seg.autoGenerator === 'uuid_short'
        ? 'a1b2c3'
        : seg.autoGenerator === 'sequential'
          ? '001'
          : 'f4e5d6';
    default:
      return 'unknown';
  }
}

/** Validate a segment */
function isSegmentValid(seg: SegmentData): boolean {
  if (!seg.label.trim()) return false;
  if (seg.type === SegmentType.ENUM && seg.allowedValues.length === 0) return false;
  if (seg.type === SegmentType.AUTO_GENERATED && !seg.autoGenerator) return false;
  return true;
}

/**
 * Naming Convention Builder - drag-and-drop segment editor
 */
export function NamingConventionBuilder(): React.ReactElement {
  const navigate = useNavigate();
  const [segments, setSegments] = useState<SegmentData[]>([createDefaultSegment()]);
  const [globalSeparator, setGlobalSeparator] = useState('_');
  const [ruleId, setRuleId] = useState('');
  const createTemplate = useCreateNamingTemplate();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setSegments((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  }, []);

  const addSegment = useCallback(() => {
    setSegments((prev) => [...prev, createDefaultSegment()]);
  }, []);

  const removeSegment = useCallback((id: string) => {
    setSegments((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const updateSegment = useCallback((id: string, updates: Partial<SegmentData>) => {
    setSegments((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...updates } : s))
    );
  }, []);

  const previewName = useMemo(() => {
    return segments.map((seg) => getSampleValue(seg)).join(globalSeparator);
  }, [segments, globalSeparator]);

  const allValid = useMemo(() => segments.every(isSegmentValid), [segments]);

  const handleSave = async (): Promise<void> => {
    if (!ruleId.trim()) {
      toast.error('Please enter a Rule ID to link this template to.');
      return;
    }
    if (!allValid) {
      toast.error('Please fix all segment validation errors before saving.');
      return;
    }

    try {
      await createTemplate.mutateAsync({
        ruleId,
        separator: globalSeparator,
        example: previewName,
        segments: segments.map((seg) => ({
          label: seg.label,
          type: seg.type,
          separator: seg.separator || globalSeparator,
          required: seg.required,
          allowedValues: seg.type === SegmentType.ENUM ? seg.allowedValues : undefined,
          pattern: seg.type === SegmentType.FREE_TEXT ? seg.pattern || undefined : undefined,
          format: seg.type === SegmentType.DATE ? seg.format || undefined : undefined,
          autoGenerator:
            seg.type === SegmentType.AUTO_GENERATED && seg.autoGenerator
              ? (seg.autoGenerator as 'uuid_short' | 'sequential' | 'hash')
              : undefined,
        })),
      });
      toast.success('Naming template saved successfully');
      navigate('/naming-templates');
    } catch {
      toast.error('Failed to save naming template.');
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Naming Convention Builder</h1>
        <p className="mt-1 text-muted-foreground">
          Build a naming template by adding and arranging segments.
        </p>
      </div>

      {/* Global settings */}
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ruleId">Linked Rule ID</Label>
              <Input
                id="ruleId"
                placeholder="Rule ID to link this template to"
                value={ruleId}
                onChange={(e) => setRuleId(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="globalSeparator">Default Separator</Label>
              <Input
                id="globalSeparator"
                placeholder="_"
                value={globalSeparator}
                onChange={(e) => setGlobalSeparator(e.target.value)}
                className="w-20"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Live Preview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Live Preview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-1">
            {segments.map((seg, idx) => {
              const valid = isSegmentValid(seg);
              return (
                <React.Fragment key={seg.id}>
                  <Badge
                    variant={valid ? 'success' : 'destructive'}
                    className="gap-1 px-3 py-1 text-sm"
                  >
                    {valid ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <X className="h-3 w-3" />
                    )}
                    {seg.label || `Segment ${idx + 1}`}
                  </Badge>
                  {idx < segments.length - 1 && (
                    <span className="text-lg font-bold text-muted-foreground">
                      {seg.separator || globalSeparator}
                    </span>
                  )}
                </React.Fragment>
              );
            })}
          </div>
          <div className="mt-4 rounded-md bg-muted p-3 font-mono text-sm">
            {previewName || '(configure segments above)'}
          </div>
        </CardContent>
      </Card>

      {/* Segments editor with drag-and-drop */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">Segments</CardTitle>
            <CardDescription>Drag to reorder. Click to edit properties.</CardDescription>
          </div>
          <Button onClick={addSegment} variant="outline" className="gap-2" aria-label="Add segment">
            <Plus className="h-4 w-4" />
            Add Segment
          </Button>
        </CardHeader>
        <CardContent>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={segments.map((s) => s.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-3">
                {segments.map((segment) => (
                  <SortableSegment
                    key={segment.id}
                    segment={segment}
                    globalSeparator={globalSeparator}
                    onUpdate={updateSegment}
                    onRemove={removeSegment}
                    canRemove={segments.length > 1}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </CardContent>
      </Card>

      {/* Save button */}
      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={createTemplate.isPending || !allValid}
          className="gap-2"
        >
          {createTemplate.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save Template
        </Button>
      </div>
    </div>
  );
}

// =====================================================
// Sortable Segment Component
// =====================================================

interface SortableSegmentProps {
  segment: SegmentData;
  globalSeparator: string;
  onUpdate: (id: string, updates: Partial<SegmentData>) => void;
  onRemove: (id: string) => void;
  canRemove: boolean;
}

function SortableSegment({
  segment,
  globalSeparator,
  onUpdate,
  onRemove,
  canRemove,
}: SortableSegmentProps): React.ReactElement {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: segment.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const [tagInput, setTagInput] = useState('');

  const addAllowedValue = (): void => {
    if (tagInput.trim()) {
      onUpdate(segment.id, {
        allowedValues: [...segment.allowedValues, tagInput.trim()],
      });
      setTagInput('');
    }
  };

  const removeAllowedValue = (value: string): void => {
    onUpdate(segment.id, {
      allowedValues: segment.allowedValues.filter((v) => v !== value),
    });
  };

  const valid = isSegmentValid(segment);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'rounded-lg border p-4',
        isDragging && 'opacity-50',
        valid ? 'border-green-200 bg-green-50/30' : 'border-red-200 bg-red-50/30'
      )}
    >
      <div className="flex items-start gap-3">
        {/* Drag handle */}
        <button
          type="button"
          className="mt-1 cursor-grab touch-none text-muted-foreground hover:text-foreground"
          aria-label="Drag to reorder"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-5 w-5" />
        </button>

        {/* Segment form */}
        <div className="flex-1 space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-xs">Label</Label>
              <Input
                placeholder="Segment name"
                value={segment.label}
                onChange={(e) => onUpdate(segment.id, { label: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Type</Label>
              <Select
                value={segment.type}
                onValueChange={(val) => onUpdate(segment.id, { type: val as SegmentType })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(segmentTypeLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <Label className="text-xs">Separator</Label>
                <Input
                  placeholder={globalSeparator}
                  value={segment.separator}
                  onChange={(e) => onUpdate(segment.id, { separator: e.target.value })}
                  className="w-16"
                />
              </div>
              <div className="flex items-center gap-2 pb-1">
                <Checkbox
                  id={`required-${segment.id}`}
                  checked={segment.required}
                  onCheckedChange={(checked) =>
                    onUpdate(segment.id, { required: checked === true })
                  }
                />
                <Label htmlFor={`required-${segment.id}`} className="text-xs">
                  Required
                </Label>
              </div>
            </div>
          </div>

          {/* Type-specific fields */}
          {segment.type === SegmentType.ENUM && (
            <div className="space-y-2">
              <Label className="text-xs">Allowed Values</Label>
              <div className="flex flex-wrap gap-1">
                {segment.allowedValues.map((val) => (
                  <Badge key={val} variant="secondary" className="gap-1">
                    {val}
                    <button
                      type="button"
                      onClick={() => removeAllowedValue(val)}
                      className="ml-1 text-muted-foreground hover:text-foreground"
                      aria-label={`Remove value ${val}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Add value"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addAllowedValue();
                    }
                  }}
                  className="flex-1"
                />
                <Button type="button" variant="outline" size="sm" onClick={addAllowedValue}>
                  Add
                </Button>
              </div>
            </div>
          )}

          {segment.type === SegmentType.FREE_TEXT && (
            <div className="space-y-1">
              <Label className="text-xs">Regex Pattern (optional)</Label>
              <Input
                placeholder="e.g., ^[A-Za-z0-9]+$"
                value={segment.pattern}
                onChange={(e) => onUpdate(segment.id, { pattern: e.target.value })}
              />
            </div>
          )}

          {segment.type === SegmentType.DATE && (
            <div className="space-y-1">
              <Label className="text-xs">Date Format</Label>
              <Input
                placeholder="e.g., YYYYMMDD"
                value={segment.format}
                onChange={(e) => onUpdate(segment.id, { format: e.target.value })}
              />
            </div>
          )}

          {segment.type === SegmentType.AUTO_GENERATED && (
            <div className="space-y-1">
              <Label className="text-xs">Generator Type</Label>
              <Select
                value={segment.autoGenerator}
                onValueChange={(val) =>
                  onUpdate(segment.id, {
                    autoGenerator: val as 'uuid_short' | 'sequential' | 'hash',
                  })
                }
              >
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Select generator" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="uuid_short">UUID Short</SelectItem>
                  <SelectItem value="sequential">Sequential</SelectItem>
                  <SelectItem value="hash">Hash</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Remove button */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onRemove(segment.id)}
          disabled={!canRemove}
          className="mt-1 text-muted-foreground hover:text-destructive"
          aria-label="Remove segment"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
