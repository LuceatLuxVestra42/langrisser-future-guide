using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using Spine;

public sealed class NoopTextureLoader : TextureLoader {
    public void Load(AtlasPage page, string path) {
        page.rendererObject = path;
    }

    public void Unload(object texture) {
    }
}

public static class SpineGeometryProgram {
    private static object AtlasRegionInfo(object rendererObject) {
        var region = rendererObject as AtlasRegion;
        if (region == null) return null;
        return new {
            name = region.name,
            page = region.page == null ? null : region.page.name,
            region.x,
            region.y,
            region.width,
            region.height,
            region.originalWidth,
            region.originalHeight,
            region.offsetX,
            region.offsetY,
            region.rotate,
            region.u,
            region.v,
            region.u2,
            region.v2,
        };
    }

    private static object Color(float r, float g, float b, float a) {
        return new { r, g, b, a };
    }

    public static int Main(string[] args) {
        if (args.Length != 3) {
            Console.Error.WriteLine("usage: SpineGeometry <atlas> <skel> <output.json>");
            return 2;
        }

        var atlasPath = Path.GetFullPath(args[0]);
        var skeletonPath = Path.GetFullPath(args[1]);
        var outputPath = Path.GetFullPath(args[2]);

        var atlas = new Atlas(atlasPath, new NoopTextureLoader());
        var binary = new SkeletonBinary(atlas);
        var skeletonData = binary.ReadSkeletonData(skeletonPath);
        if (skeletonData.Version != "3.3.05")
            throw new Exception("version-matched renderer expected Spine 3.3.05 but got: " + skeletonData.Version);

        var skeleton = new Skeleton(skeletonData);
        skeleton.SetToSetupPose();
        skeleton.UpdateWorldTransform();

        var renderables = new List<object>();
        var nonRenderAttachments = new List<object>();
        var blendModes = new HashSet<string>();
        var minX = float.PositiveInfinity;
        var minY = float.PositiveInfinity;
        var maxX = float.NegativeInfinity;
        var maxY = float.NegativeInfinity;
        int triangleCount = 0;
        int vertexCount = 0;

        var drawOrder = skeleton.DrawOrder;
        for (int drawIndex = 0; drawIndex < drawOrder.Count; drawIndex++) {
            var slot = drawOrder.Items[drawIndex];
            var attachment = slot.Attachment;
            if (attachment == null) continue;

            var blendMode = slot.Data.BlendMode.ToString();
            blendModes.Add(blendMode);

            if (attachment is RegionAttachment region) {
                region.UpdateOffset();
                var vertices = new float[8];
                region.ComputeWorldVertices(slot.Bone, vertices);
                var triangles = new int[] { 0, 1, 2, 2, 3, 0 };
                for (int i = 0; i < vertices.Length; i += 2) {
                    minX = Math.Min(minX, vertices[i]);
                    minY = Math.Min(minY, vertices[i + 1]);
                    maxX = Math.Max(maxX, vertices[i]);
                    maxY = Math.Max(maxY, vertices[i + 1]);
                }
                vertexCount += vertices.Length / 2;
                triangleCount += triangles.Length / 3;
                renderables.Add(new {
                    drawIndex,
                    slot = slot.Data.Name,
                    attachment = attachment.Name,
                    type = "RegionAttachment",
                    blendMode,
                    slotColor = Color(slot.R, slot.G, slot.B, slot.A),
                    attachmentColor = Color(region.R, region.G, region.B, region.A),
                    atlas = AtlasRegionInfo(region.RendererObject),
                    vertices,
                    uvs = region.UVs,
                    triangles,
                });
            } else if (attachment is MeshAttachment mesh) {
                var vertices = new float[mesh.WorldVerticesLength];
                mesh.ComputeWorldVertices(slot, vertices);
                var triangles = mesh.Triangles ?? Array.Empty<int>();
                var uvs = mesh.UVs ?? Array.Empty<float>();
                for (int i = 0; i < vertices.Length; i += 2) {
                    minX = Math.Min(minX, vertices[i]);
                    minY = Math.Min(minY, vertices[i + 1]);
                    maxX = Math.Max(maxX, vertices[i]);
                    maxY = Math.Max(maxY, vertices[i + 1]);
                }
                vertexCount += vertices.Length / 2;
                triangleCount += triangles.Length / 3;
                renderables.Add(new {
                    drawIndex,
                    slot = slot.Data.Name,
                    attachment = attachment.Name,
                    type = "MeshAttachment",
                    blendMode,
                    slotColor = Color(slot.R, slot.G, slot.B, slot.A),
                    attachmentColor = Color(mesh.R, mesh.G, mesh.B, mesh.A),
                    atlas = AtlasRegionInfo(mesh.RendererObject),
                    vertices,
                    uvs,
                    triangles,
                });
            } else {
                nonRenderAttachments.Add(new {
                    drawIndex,
                    slot = slot.Data.Name,
                    attachment = attachment.Name,
                    type = attachment.GetType().Name,
                    blendMode,
                });
            }
        }

        if (renderables.Count == 0 || triangleCount == 0)
            throw new Exception("setup pose produced no renderable Spine geometry");
        if (!float.IsFinite(minX) || !float.IsFinite(minY) || !float.IsFinite(maxX) || !float.IsFinite(maxY))
            throw new Exception("setup pose bounds are non-finite");

        var animations = new List<string>();
        for (int i = 0; i < skeletonData.Animations.Count; i++)
            animations.Add(skeletonData.Animations.Items[i].Name);

        var result = new {
            schemaVersion = 1,
            status = "PASS_VERSION_MATCHED_SPINE_GEOMETRY",
            runtime = new {
                source = "EsotericSoftware/spine-runtimes",
                commit = "1c1936532527900f74cfb58f7002998bf157b254",
                sourceCommitDate = "2016-06-17",
                sourceCommitPurpose = "C# runtimes v3.3.x format including SkeletonBinary",
            },
            skeleton = new {
                version = skeletonData.Version,
                hash = skeletonData.Hash,
                setupWidth = skeletonData.Width,
                setupHeight = skeletonData.Height,
                bones = skeletonData.Bones.Count,
                slots = skeletonData.Slots.Count,
                skins = skeletonData.Skins.Count,
                animations,
                pose = "setup",
            },
            geometry = new {
                renderableAttachmentCount = renderables.Count,
                nonRenderAttachmentCount = nonRenderAttachments.Count,
                vertexCount,
                triangleCount,
                blendModes = blendModes.OrderBy(x => x).ToArray(),
                bounds = new { minX, minY, maxX, maxY, width = maxX - minX, height = maxY - minY },
                renderables,
                nonRenderAttachments,
            },
        };

        Directory.CreateDirectory(Path.GetDirectoryName(outputPath)!);
        var options = new JsonSerializerOptions { WriteIndented = true };
        File.WriteAllText(outputPath, JsonSerializer.Serialize(result, options) + Environment.NewLine);
        Console.WriteLine(JsonSerializer.Serialize(new {
            result.status,
            skeleton = new { skeletonData.Version, skeletonData.Width, skeletonData.Height },
            renderables = renderables.Count,
            triangleCount,
            bounds = new { minX, minY, maxX, maxY },
            blendModes = blendModes.OrderBy(x => x).ToArray(),
        }));
        return 0;
    }
}
