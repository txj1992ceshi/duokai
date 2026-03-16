import { NextResponse } from 'next/server';
import { getDb, saveDb, Behavior } from '@/lib/db';

export async function GET() {
  const db = getDb();
  return NextResponse.json(db.behaviors || []);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const db = getDb();
    
    db.behaviors = db.behaviors || [];
    const newBehavior: Behavior = {
      id: `b-${Date.now()}`,
      name: body.name || '模板',
      description: body.description || '',
      actions: body.actions || [],
    };
    
    db.behaviors.push(newBehavior);
    saveDb(db);
    return NextResponse.json(newBehavior, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
