import { NextRequest, NextResponse } from 'next/server';
import { connectMongo } from '@/lib/mongodb';
import { requireUser } from '@/lib/requireUser';
import { BehaviorModel } from '@/models/Behavior';

export async function GET(req: NextRequest) {
  try {
    const authUser = requireUser(req);
    await connectMongo();

    const behaviors = await BehaviorModel.find({
      userId: authUser.userId,
    })
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({
      success: true,
      behaviors: behaviors.map((behavior) => ({
        id: String(behavior._id),
        userId: String(behavior.userId),
        name: behavior.name,
        description: behavior.description || '',
        enabled: !!behavior.enabled,
        actions: Array.isArray(behavior.actions) ? behavior.actions : [],
        createdAt: behavior.createdAt,
        updatedAt: behavior.updatedAt,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request failed';

    return NextResponse.json(
      {
        success: false,
        error: message === 'Unauthorized' ? 'Unauthorized' : 'Failed to fetch behaviors',
      },
      {
        status: message === 'Unauthorized' ? 401 : 500,
      }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const authUser = requireUser(req);
    await connectMongo();

    const body = await req.json();
    const name = String(body.name || '').trim();

    if (!name) {
      return NextResponse.json(
        { success: false, error: 'Behavior name is required' },
        { status: 400 }
      );
    }

    const behavior = await BehaviorModel.create({
      userId: authUser.userId,
      name,
      description: String(body.description || ''),
      enabled: typeof body.enabled === 'boolean' ? body.enabled : true,
      actions: Array.isArray(body.actions) ? body.actions : [],
    });

    return NextResponse.json({
      success: true,
      behavior: {
        id: String(behavior._id),
        userId: String(behavior.userId),
        name: behavior.name,
        description: behavior.description || '',
        enabled: !!behavior.enabled,
        actions: Array.isArray(behavior.actions) ? behavior.actions : [],
        createdAt: behavior.createdAt,
        updatedAt: behavior.updatedAt,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request failed';

    return NextResponse.json(
      {
        success: false,
        error: message === 'Unauthorized' ? 'Unauthorized' : 'Failed to create behavior',
      },
      {
        status: message === 'Unauthorized' ? 401 : 500,
      }
    );
  }
}
