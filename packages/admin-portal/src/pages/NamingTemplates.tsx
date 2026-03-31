import React from 'react';
import { Link } from 'react-router-dom';
import { useNamingTemplates } from '@/hooks/useApi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus, Loader2, FileText } from 'lucide-react';

/**
 * Naming Templates list page
 */
export function NamingTemplates(): React.ReactElement {
  const { data: templates, isLoading, error } = useNamingTemplates();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Naming Templates</h1>
          <p className="mt-1 text-muted-foreground">
            Manage naming convention templates for campaigns, ad sets, and ads.
          </p>
        </div>
        <Button asChild className="gap-2" aria-label="Create naming template">
          <Link to="/naming-templates/new">
            <Plus className="h-4 w-4" />
            Create Template
          </Link>
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12" role="status">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="sr-only">Loading naming templates...</span>
        </div>
      )}

      {error && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-destructive">Failed to load naming templates. Please try again.</p>
          </CardContent>
        </Card>
      )}

      {templates && templates.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <FileText className="h-12 w-12 text-muted-foreground" />
            <p className="text-muted-foreground">No naming templates yet.</p>
            <Button asChild className="gap-2">
              <Link to="/naming-templates/new">
                <Plus className="h-4 w-4" />
                Create your first template
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {templates && templates.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {templates.length} Template{templates.length !== 1 ? 's' : ''}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full" role="table">
                <thead>
                  <tr className="border-b text-left text-sm text-muted-foreground">
                    <th className="pb-3 pr-4 font-medium">Template ID</th>
                    <th className="pb-3 pr-4 font-medium">Segments</th>
                    <th className="pb-3 pr-4 font-medium">Separator</th>
                    <th className="pb-3 font-medium">Example</th>
                  </tr>
                </thead>
                <tbody>
                  {templates.map((template) => (
                    <tr key={template.id} className="border-b last:border-0">
                      <td className="py-3 pr-4 font-mono text-sm">{template.id}</td>
                      <td className="py-3 pr-4">
                        <div className="flex flex-wrap gap-1">
                          {Array.isArray(template.segments) ? (
                            template.segments.map((seg, idx) => (
                              <Badge key={idx} variant="outline" className="text-xs">
                                {seg.label}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-xs text-muted-foreground">--</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 pr-4 font-mono">{template.separator}</td>
                      <td className="py-3 font-mono text-sm text-muted-foreground">
                        {template.example || '--'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
