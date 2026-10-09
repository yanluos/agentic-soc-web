// Remote-plugin SDK bridge (design §13). The host publishes its React instance
// and its stable SDK surfaces on window.__SOC_SDK__; the tiny shim modules in
// public/sdk/*.js re-export them, and index.html's import map points the bare
// specifiers a remote ESM bundle uses (react, react/jsx-runtime, react-dom,
// @soc/platform, @soc/ui) at those shims — so a remotely loaded plugin shares
// ONE React (hooks work) and the same component library.
import * as React from "react"
import * as ReactDOM from "react-dom"
import * as JSXRuntime from "react/jsx-runtime"
import * as sonner from "sonner"
const { toast } = sonner

import * as platform from "@/platform"
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSeparator, FieldSet, FieldTitle } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

export const SDK_VERSION = "1"

window.__SOC_SDK__ = {
  version: SDK_VERSION,
  react: React,
  reactDom: ReactDOM,
  jsxRuntime: JSXRuntime,
  platform: { ...platform, toast },
  sonner,
  ui: {
    Alert, AlertAction, AlertDescription, AlertTitle, Badge, Button,
    Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, Checkbox,
    Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
    Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle,
    Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSeparator, FieldSet, FieldTitle,
    Input, Label, Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue,
    Separator, Skeleton, Spinner, Switch, Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow,
    Tabs, TabsContent, TabsList, TabsTrigger, Textarea, Tooltip, TooltipContent, TooltipTrigger,
  },
}
