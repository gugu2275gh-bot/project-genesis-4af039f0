import { useState, useMemo } from 'react';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface ServiceTypeComboboxProps {
  value: string;
  onValueChange: (value: string) => void;
  serviceTypes: Array<{ code: string; name: string }> | undefined;
  placeholder?: string;
}

export function ServiceTypeCombobox({ value, onValueChange, serviceTypes, placeholder = 'Selecione o serviço...' }: ServiceTypeComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!serviceTypes) return [];
    if (!search) return serviceTypes;
    const lower = search.toLowerCase();
    return serviceTypes.filter(st =>
      st.name.toLowerCase().includes(lower) || st.code.toLowerCase().includes(lower)
    );
  }, [serviceTypes, search]);

  const stripPrefix = (name: string) => {
    const dashIndex = name.indexOf(' - ');
    return dashIndex !== -1 ? name.substring(dashIndex + 3) : name;
  };

  const selectedLabel = serviceTypes?.find(st => st.code === value)?.name;
  const displaySelectedLabel = selectedLabel ? stripPrefix(selectedLabel) : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">
            {selectedLabel || placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar serviço..."
            className="h-8 border-0 p-0 shadow-none focus-visible:ring-0"
          />
        </div>
        <div className="max-h-[250px] overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Nenhum serviço encontrado</p>
          ) : (
            <div className="p-1">
              {filtered.map((st) => (
                <button
                  key={st.code}
                  type="button"
                  className={cn(
                    'relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground',
                    value === st.code && 'bg-accent'
                  )}
                  onClick={() => {
                    onValueChange(st.code);
                    setOpen(false);
                    setSearch('');
                  }}
                >
                  <Check
                    className={cn(
                      'absolute left-2 h-4 w-4',
                      value === st.code ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  {st.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
