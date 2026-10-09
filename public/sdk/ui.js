// Import-map shim: `@soc/ui` → the host's shadcn/ui components.
const U = window.__SOC_SDK__.ui
export default U
export const {
  Alert, AlertAction, AlertDescription, AlertTitle, Badge, Button,
  Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, Checkbox,
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
  Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle,
  Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSeparator, FieldSet, FieldTitle,
  Input, Label, Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue,
  Separator, Skeleton, Spinner, Switch, Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow,
  Tabs, TabsContent, TabsList, TabsTrigger, Textarea, Tooltip, TooltipContent, TooltipTrigger,
} = U
