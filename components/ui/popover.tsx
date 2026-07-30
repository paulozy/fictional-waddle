"use client"

import * as React from "react"
import { Popover as PopoverPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

/**
 * Popover ancorado, no estilo `radix-nova` dos outros primitivos.
 *
 * **Não é dependência nova**: `@radix-ui/react-popover` já vem dentro do meta-pacote
 * `radix-ui` que o projeto usa, e o import é o mesmo idioma de `dialog.tsx` e
 * `sheet.tsx`.
 */

function Popover({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

function PopoverTrigger({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

function PopoverAnchor({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />
}

function PopoverClose({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Close>) {
  return <PopoverPrimitive.Close data-slot="popover-close" {...props} />
}

function PopoverContent({
  className,
  align = "center",
  sideOffset = 6,
  collisionPadding = 8,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    /**
     * O `Portal` é obrigatório aqui, não opcional: na grade semanal o bloco tem
     * `overflow-hidden` e o contêiner tem `overflow-x-auto`, então sem portal o popover
     * seria recortado em dois níveis.
     */
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cn(
          "z-50 w-72 max-w-[calc(100vw-1rem)] rounded-xl bg-popover p-3 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none",
          // Teto com rolagem própria, pelo mesmo motivo do diálogo: `svh` é estável,
          // `dvh` é remedido a cada retração da barra do Safari.
          "max-h-[calc(100svh-2rem)] overflow-y-auto",
          "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
}

export { Popover, PopoverAnchor, PopoverClose, PopoverContent, PopoverTrigger }
