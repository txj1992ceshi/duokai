import { NextRequest, NextResponse } from 'next/server';
import { connectMongo } from '@/lib/mongodb';
import { requireUser } from '@/lib/requireUser';
import { GroupModel } from '@/models/Group';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const authUser = requireUser(req);
    await connectMongo();

    const { id } = await context.params;

    const group = await GroupModel.findOne({
      _id: id,
      userId: authUser.userId,
    }).lean();

    if (!group) {
      return NextResponse.json(
        { success: false, error: 'Group not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      group: {
        id: String(group._id),
        userId: String(group.userId),
        name: group.name,
        color: group.color || '',
        notes: group.notes || '',
        createdAt: group.createdAt,
        updatedAt: group.updatedAt,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request failed';

    return NextResponse.json(
      {
        success: false,
        error: message === 'Unauthorized' ? 'Unauthorized' : 'Failed to fetch group',
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
          { success: false, error: 'Group name is required' },
          { status: 400 }
        );
      }
      updateData.name = name;
    }

    if (typeof body.color === 'string') {
      updateData.color = body.color;
    }

    if (typeof body.notes === 'string') {
      updateData.notes = body.notes;
    }

    const group = await GroupModel.findOneAndUpdate(
      {
        _id: id,
        userId: authUser.userId,
      },
      updateData,
      { new: true }
    ).lean();

    if (!group) {
      return NextResponse.json(
        { success: false, error: 'Group not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      group: {
        id: String(group._id),
        userId: String(group.userId),
        name: group.name,
        color: group.color || '',
        notes: group.notes || '',
        createdAt: group.createdAt,
        updatedAt: group.updatedAt,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request failed';

    return NextResponse.json(
      {
        success: false,
        error: message === 'Unauthorized' ? 'Unauthorized' : 'Failed to update group',
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

    const group = await GroupModel.findOneAndDelete({
      _id: id,
      userId: authUser.userId,
    }).lean();

    if (!group) {
      return NextResponse.json(
        { success: false, error: 'Group not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Group deleted successfully',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request failed';

    return NextResponse.json(
      {
        success: false,
        error: message === 'Unauthorized' ? 'Unauthorized' : 'Failed to delete group',
      },
      {
        status: message === 'Unauthorized' ? 401 : 500,
      }
    );
  }
}
