import { useEffect, useState } from "react";
import { useWorkspace } from "@/store/workspace";
import { useNavigate } from "@tanstack/react-router";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { PartyRepo, ItemRepo, SalesRepo, PurchaseRepo } from "@/repositories";
import { Users, Package, ShoppingCart, Truck } from "lucide-react";

export function GlobalSearch() {
  const { globalSearchOpen, setGlobalSearch } = useWorkspace();
  const navigate = useNavigate();
  const [data, setData] = useState<{
    parties: any[];
    items: any[];
    sales: any[];
    purchases: any[];
  }>({ parties: [], items: [], sales: [], purchases: [] });

  useEffect(() => {
    if (globalSearchOpen) {
      setData({
        parties: PartyRepo.all(),
        items: ItemRepo.all(),
        sales: SalesRepo.all(),
        purchases: PurchaseRepo.all(),
      });
    }
  }, [globalSearchOpen]);

  const go = (path: string) => {
    setGlobalSearch(false);
    navigate({ to: path });
  };

  return (
    <CommandDialog open={globalSearchOpen} onOpenChange={setGlobalSearch}>
      <Command>
        <CommandInput placeholder="Search parties, items, invoices..." autoFocus />
        <CommandList>
          <CommandEmpty>No results.</CommandEmpty>
          {data.parties.length > 0 && (
            <CommandGroup heading="Parties">
              {data.parties.slice(0, 6).map((p) => (
                <CommandItem
                  key={p.id}
                  onSelect={() => go("/parties")}
                  value={`party ${p.name} ${p.phone ?? ""}`}
                >
                  <Users className="h-3.5 w-3.5" />
                  {p.name}
                  <span className="ml-auto text-xs text-muted-foreground">{p.phone}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {data.items.length > 0 && (
            <CommandGroup heading="Items">
              {data.items.slice(0, 6).map((i) => (
                <CommandItem
                  key={i.id}
                  onSelect={() => go("/items")}
                  value={`item ${i.name} ${i.sku ?? ""}`}
                >
                  <Package className="h-3.5 w-3.5" />
                  {i.name}
                  <span className="ml-auto text-xs text-muted-foreground">Stock: {i.stock}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {data.sales.length > 0 && (
            <CommandGroup heading="Sales Invoices">
              {data.sales.slice(0, 6).map((s) => (
                <CommandItem
                  key={s.id}
                  onSelect={() => go("/sales")}
                  value={`sale ${s.number} ${s.partyName}`}
                >
                  <ShoppingCart className="h-3.5 w-3.5" />
                  {s.number} — {s.partyName}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {data.purchases.length > 0 && (
            <CommandGroup heading="Purchase Bills">
              {data.purchases.slice(0, 6).map((s) => (
                <CommandItem
                  key={s.id}
                  onSelect={() => go("/purchase")}
                  value={`purchase ${s.number} ${s.partyName}`}
                >
                  <Truck className="h-3.5 w-3.5" />
                  {s.number} — {s.partyName}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
