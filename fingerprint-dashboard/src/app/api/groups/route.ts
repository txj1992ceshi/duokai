import { NextRequest, NextResponse } from 'next/server';
import { connectMongo } from '@/lib/mongodb';
import { requireUser } from '@/lib/requireUser';
import { GroupModel } from '@/models/Group';

export async function GET(req: NextRequest) {
  try {
    const authUser = requireUser(req);
    await connectMongo();

    const groups = await GroupModel.find({
      userId: authUser.userId,
    })
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({
      success: true,
      groups: groups.map((group) => ({
        id: String(group._id),
        userId: String(group.userId),
        name: group.name,
        color: group.color || '',
        notes: group.notes || '',
        createdAt: group.createdAt,
        updatedAt: group.updatedAt,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request failed';

    return NextResponse.json(
      {
        success: false,
        error: message === 'Unauthorized' ? 'Unauthorized' : 'Failed to fetch groups',
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
        { success: false, error: 'Group name is required' },
        { status: 400 }
      );
    }

    const group = await GroupModel.create({
      userId: authUser.userId,
      name,
      color: String(body.color || ''),
      notes: String(body.notes || ''),
    });

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
        error: message === 'Unauthorized' ? 'Unauthorized' : 'Failed to create group',
      },
      {
        status: message === 'Unauthorized' ? 401 : 500,
      }
    );
  }
}
