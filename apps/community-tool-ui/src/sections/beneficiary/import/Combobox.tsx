'use client';

import { Check, ChevronsUpDown } from 'lucide-react';
import * as React from 'react';

import { cn } from '@rahat-ui/shadcn/src';
import { Button } from '@rahat-ui/shadcn/src/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from '@rahat-ui/shadcn/src/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@rahat-ui/shadcn/src/components/ui/popover';
import { ScrollArea } from '@rahat-ui/shadcn/src/components/ui/scroll-area';
import { CommandList } from 'cmdk';
import { humanizeString } from 'apps/community-tool-ui/src/utils';

export const EMPTY_SELECTION = 'No Selection';

export function ComboBox({
  data,
  handleTargetFieldChange,
  column,
  selectedField,
}: any) {
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState('');

  const handleClearSelection = () => {
    handleTargetFieldChange(EMPTY_SELECTION, value);
    setValue('');
  };

  React.useEffect(() => {
    if (selectedField) setValue(selectedField);
  }, []);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-[400px] justify-between"
        >
          {value
            ? data.find((d: string) => d.toLowerCase() === value.toLowerCase())
            : '--Select Field--'}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0">
        {value && (
          <button onClick={handleClearSelection}>
            <span className="p-2 text-slate-400 text-xs">Clear Selection</span>
          </button>
        )}

        <Command>
          <CommandInput placeholder="--Select Field--" />
          <ScrollArea className="h-[200px]">
            <CommandEmpty>No field found.</CommandEmpty>
            <CommandList>
              <CommandGroup>
                {data.map((d: string) => (
                  <CommandItem
                    key={d}
                    value={humanizeString(d)}
                    onSelect={(currentValue) => {
                      const formatted = currentValue
                        .toLowerCase()
                        .replace(/ /g, '_');
                      setValue(formatted === value ? '' : formatted);
                      setOpen(false);
                      handleTargetFieldChange(column, d);
                    }}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        value === d ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    {humanizeString(d)}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </ScrollArea>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
