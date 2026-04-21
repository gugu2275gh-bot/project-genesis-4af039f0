import { useState, useMemo } from 'react';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface ServiceFilterComboboxProps {
  value: string;
  onValueChange: (value: string) => void;
  serviceTypes: Array<{ id: string; code: string; name: string }> | undefined;
  placeholder?: string;
  className?: string;
}

const stripPrefix = (name: string) => {
  const dashIndex = name.indexOf(' - ');
  return dashIndex !== -1 ? name.substring(dashIndex + 3) : name;
};

export function ServiceFilterCombobox({
  value,
  onValueChange,
  serviceTypes,
  placeholder = 'Todos os serviços',
  className,
}: ServiceFilterComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const sorted = useMemo(() => {
    if (!serviceTypes) return [];
    return [...serviceTypes].sort((a, b) =>
      stripPrefix(a.name).localeCompare(stripPrefix(b.name), 'pt')
    );
  }, [serviceTypes]);

  const filtered = useMemo(() => {
    if (!search) return sorted;
    const lower = search.toLowerCase();
    return sorted.filter(
      (st) => st.name.toLowerCase().includes(lower) || st.code.toLowerCase().includes(lower)
    );
  }, [sorted, search]);

  const selectedLabel =
    value === 'all' ? placeholder : serviceTypes?.find((st) => st.id === value)?.name || placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen} modal={true}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn('w-[260px] justify-between font-normal overflow-hidden min-w-0', className)}
        >
          <span className="truncate min-w-0 flex-1 text-left">{selectedLabel}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0 z-[9999]"
        align="start"
        side="bottom"
        sideOffset={4}
      >
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar serviço..."
            className="h-8 border-0 p-0 shadow-none focus-visible:ring-0"
          />
        </div>
        <ScrollArea className="h-[280px]">
          <div className="p-1">
            <button
              type="button"
              className={cn(
                'relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm text-left outline-none hover:bg-accent hover:text-accent-foreground',
                value === 'all' && 'bg-accent'
              )}
              onClick={() => {
                onValueChange('all');
                setOpen(false);
                setSearch('');
              }}
            >
              <Check className={cn('absolute left-2 h-4 w-4', value === 'all' ? 'opacity-100' : 'opacity-0')} />
              Todos os serviços
            </button>
            {filtered.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Nenhum serviço encontrado</p>
            ) : (
              filtered.map((st) => (
                <button
                  key={st.id}
                  type="button"
                  className={cn(
                    'relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm text-left outline-none hover:bg-accent hover:text-accent-foreground',
                    value === st.id && 'bg-accent'
                  )}
                  onClick={() => {
                    onValueChange(st.id);
                    setOpen(false);
                    setSearch('');
                  }}
                >
                  <Check
                    className={cn('absolute left-2 h-4 w-4', value === st.id ? 'opacity-100' : 'opacity-0')}
                  />
                  {st.name}
                </button>
              ))
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
