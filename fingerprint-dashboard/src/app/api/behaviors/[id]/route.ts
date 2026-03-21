import { NextRequest, NextResponse } from 'next/server';
import { connectMongo } from '@/lib/mongodb';
import { requireUser } from '@/lib/requireUser';
import { BehaviorModel } from '@/models/Behavior';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const authUser = requireUser(req);
    await connectMongo();

    const { id } = await context.params;

    const behavior = await BehaviorModel.findOne({
      _id: id,
      userId: authUser.userId,
    }).lean();

    if (!behavior) {
      return NextResponse.json(
        { success: false, error: 'Behavior not found' },
        { status: 404 }
      );
    }

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
        error: message === 'Unauthorized' ? 'Unauthorized' : 'Failed to fetch behavior',
      },
      {
        status: message === 'Unauthorized' ? 401 : 500,
      }
    );
  }
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const authUser = requireUser(req);
    await connectMongo();

    const { id } = await context.params;
    const body = await req.json();

    const updateData: Record<string, unknown> = {};

    if (typeof body.name === 'string') {
      const name = body.name.trim();
      if (!name) {
        return NextResponse.json(
          { success: false, error: 'Behavior name is required' },
          { status: 400 }
        );
      }
      updateData.name = name;
    }

    if (typeof body.description === 'string') {
      updateData.description = body.description;
    }

    if (typeof body.enabled === 'boolean') {
      updateData.enabled = body.enabled;
    }

    if (Array.isArray(body.actions)) {
      updateData.actions = body.actions;
    }

    const behavior = await BehaviorModel.findOneAndUpdate(
      {
        _id: id,
        userId: authUser.userId,
      },
      updateData,
      { new: true }
    ).lean();

    if (!behavior) {
      return NextResponse.json(
        { success: false, error: 'Behavior not found' },
        { status: 404 }
      );
    }

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
        error: message === 'Unauthorized' ? 'Unauthorized' : 'Failed to update behavior',
      },
      {
        status: message === 'Unauthorized' ? 401 : 500,
      }
    );
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    const authUser = requireUser(req);
    await connectMongo();

    const { id } = await context.params;

    const behavior = await BehaviorModel.findOneAndDelete({
      _id: id,
      userId: authUser.userId,
    }).lean();

    if (!behavior) {
      return NextResponse.json(
        { success: false, error: 'Behavior not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Behavior deleted successfully',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request failed';

    return NextResponse.json(
      {
        success: false,
        error: message === 'Unauthorized' ? 'Unauthorized' : 'Failed to delete behavior',
      },
      {
        status: message === 'Unauthorized' ? 401 : 500,
      }
    );
  }
}
